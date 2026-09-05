package tool

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"html"
	"regexp"
	"strings"
	"sync"

	"github.com/cloudwego/eino/components/tool"
	"github.com/cloudwego/eino/schema"

	"ragflow/internal/agent/runtime"
	seafilepkg "ragflow/internal/connector/seafile"
)

const datasetWriteToolName = "write_my_dataset"

var weeklyFilenameRE = regexp.MustCompile(`^weekly-report-\d{4}-W\d{2}\.(md|docx|pdf)$`)
var weekIDRE = regexp.MustCompile(`^\d{4}-W\d{2}$`)

type DatasetWriteRequest struct {
	DatasetID string
	WeekID    string
	Filename  string
	Content   string
	Body      []byte
	Metadata  map[string]any
}

type DatasetWriteResult struct {
	Action     string
	DocumentID string
	Filename   string
}

// DatasetWriter upserts a markdown weekly report by exact name.
type DatasetWriter func(ctx context.Context, req DatasetWriteRequest) (*DatasetWriteResult, error)

var (
	datasetWriterMu sync.RWMutex
	datasetWriter   DatasetWriter
)

func SetDatasetWriter(fn DatasetWriter) {
	datasetWriterMu.Lock()
	defer datasetWriterMu.Unlock()
	datasetWriter = fn
}

type datasetWriteParams struct {
	DatasetIDs         []string
	PublishPolicy      string
	Language           string
	OutputFormat       string
	SeafileConnectorID string
	SeafileRepoID      string
	SeafilePath        string
}

type DatasetWriteTool struct {
	defaults datasetWriteParams
}

func NewDatasetWriteTool() *DatasetWriteTool {
	return NewDatasetWriteToolWithDefaults(datasetWriteParams{PublishPolicy: "auto", Language: "zh"})
}

func NewDatasetWriteToolWithDefaults(defaults datasetWriteParams) *DatasetWriteTool {
	if defaults.PublishPolicy == "" {
		defaults.PublishPolicy = "auto"
	}
	if format, err := normalizeWeeklyOutputFormat(defaults.OutputFormat); err == nil {
		defaults.OutputFormat = format
	} else {
		defaults.OutputFormat = "md"
	}
	return &DatasetWriteTool{defaults: defaults}
}

func (d *DatasetWriteTool) Info(_ context.Context) (*schema.ToolInfo, error) {
	return &schema.ToolInfo{
		Name: datasetWriteToolName,
		Desc: "Write the generated weekly report markdown into the configured dataset.",
		ParamsOneOf: schema.NewParamsOneOfByParams(map[string]*schema.ParameterInfo{
			"content": {Type: schema.String, Desc: "Weekly report markdown", Required: false},
			"week_id": {Type: schema.String, Desc: "ISO week id such as 2026-W33", Required: false},
		}),
	}, nil
}

func (d *DatasetWriteTool) InvokableRun(ctx context.Context, argsJSON string, _ ...tool.Option) (string, error) {
	args := map[string]any{}
	if strings.TrimSpace(argsJSON) != "" {
		if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
			return datasetWriteErrJSON(err), nil
		}
	}
	if strings.EqualFold(d.defaults.PublishPolicy, "draft") {
		raw, _ := json.Marshal(map[string]any{"json": map[string]any{"action": "skipped", "reason": "publish_policy=draft"}})
		return string(raw), nil
	}
	weekID, _ := args["week_id"].(string)
	weekID = strings.TrimSpace(weekID)
	if !weekIDRE.MatchString(weekID) {
		return datasetWriteErrJSON(fmt.Errorf("week_id must look like YYYY-Www")), nil
	}
	content, _ := args["content"].(string)
	filename, blob, err := buildWeeklyReportFile(weekID, content, d.defaults.OutputFormat)
	if err != nil {
		return datasetWriteErrJSON(err), nil
	}
	if !weeklyFilenameRE.MatchString(filename) {
		return datasetWriteErrJSON(fmt.Errorf("computed filename rejected")), nil
	}
	if len(d.defaults.DatasetIDs) != 1 {
		return datasetWriteErrJSON(fmt.Errorf("DatasetWrite requires exactly one dataset_id")), nil
	}
	format, _ := normalizeWeeklyOutputFormat(d.defaults.OutputFormat)
	datasetWriterMu.RLock()
	writer := datasetWriter
	datasetWriterMu.RUnlock()
	if writer == nil {
		return datasetWriteErrJSON(fmt.Errorf("dataset writer is not wired; use the Python canvas for scheduled publish")), nil
	}
	result, err := writer(ctx, DatasetWriteRequest{
		DatasetID: d.defaults.DatasetIDs[0],
		WeekID:    weekID,
		Filename:  filename,
		Content:   content,
		Body:      blob,
		Metadata:  map[string]any{"week_id": weekID, "kind": "weekly_report", "language": d.defaults.Language, "output_format": format},
	})
	if err != nil {
		return datasetWriteErrJSON(err), nil
	}
	payload := map[string]any{
		"action":        result.Action,
		"document_id":   result.DocumentID,
		"filename":      result.Filename,
		"week_id":       weekID,
		"output_format": format,
	}
	summary := fmt.Sprintf("Wrote %s (%s).", result.Filename, result.Action)
	if seafileConfigured(d.defaults.SeafileRepoID, d.defaults.SeafilePath) {
		seafileResult, seafileErr := publishWeeklyReportToSeafile(ctx, d.defaults, filename, blob)
		if seafileErr != nil {
			return datasetWriteErrJSON(seafileErr), nil
		}
		payload["seafile"] = seafileResult
		summary = fmt.Sprintf("%s Seafile %v (%v).", summary, seafileResult["path"], seafileResult["action"])
	} else {
		payload["seafile"] = map[string]any{"action": "skipped"}
	}
	raw, _ := json.Marshal(map[string]any{
		"json":               payload,
		"formalized_content": summary,
	})
	return string(raw), nil
}

func seafileConfigured(repoID, path string) bool {
	return strings.TrimSpace(repoID) != "" && strings.TrimSpace(path) != ""
}

func publishWeeklyReportToSeafile(ctx context.Context, defaults datasetWriteParams, filename string, content []byte) (map[string]any, error) {
	connectorID := strings.TrimSpace(defaults.SeafileConnectorID)
	if connectorID == "" {
		return nil, fmt.Errorf("seafile connector_id is required when library and path are set")
	}
	userID := ""
	if state, _, err := runtime.GetStateFromContext[*runtime.CanvasState](ctx); err == nil && state != nil {
		userID = strings.TrimSpace(fmt.Sprint(state.Sys["user_id"]))
		if userID == "" {
			userID = strings.TrimSpace(fmt.Sprint(state.Sys["tenant_id"]))
		}
	}
	snapshot, err := lookupConnector(ctx, connectorID, userID)
	if err != nil {
		return nil, err
	}
	if snapshot == nil || !strings.EqualFold(snapshot.Source, "seafile") {
		return nil, fmt.Errorf("connector is not a seafile source")
	}
	cfg := snapshot.Config
	if cfg == nil {
		cfg = map[string]any{}
	}
	creds, _ := cfg["credentials"].(map[string]any)
	if creds == nil {
		creds = map[string]any{}
	}
	token, _ := creds["seafile_token"].(string)
	repoToken, _ := creds["repo_token"].(string)
	baseURL, _ := cfg["seafile_url"].(string)
	client := seafilepkg.NewClient(baseURL, token, repoToken, nil)
	libraries, err := client.ListLibraries()
	if err != nil {
		return nil, err
	}
	repoID, err := resolveSeafileLibraryID(libraries, defaults.SeafileRepoID)
	if err != nil {
		return nil, err
	}
	uploaded, err := client.UpsertFile(repoID, defaults.SeafilePath, filename, content)
	if err != nil {
		return nil, err
	}
	uploaded["repo_id"] = repoID
	return uploaded, nil
}

func resolveSeafileLibraryID(libraries []map[string]any, repo string) (string, error) {
	wanted := strings.TrimSpace(repo)
	if wanted == "" {
		return "", fmt.Errorf("seafile library is empty")
	}
	for _, lib := range libraries {
		id, _ := lib["id"].(string)
		if strings.TrimSpace(id) == wanted {
			return wanted, nil
		}
	}
	for _, lib := range libraries {
		name, _ := lib["name"].(string)
		id, _ := lib["id"].(string)
		if strings.TrimSpace(name) == wanted && id != "" {
			return id, nil
		}
	}
	return "", fmt.Errorf("seafile library %q was not found", wanted)
}

func datasetWriteErrJSON(err error) string {
	raw, _ := json.Marshal(map[string]any{"_ERROR": err.Error(), "json": map[string]any{"action": "error"}})
	return string(raw)
}

func (d *DatasetWriteTool) ComponentSpec() ComponentSpec {
	return ComponentSpec{
		Inputs: map[string]string{
			"content": "Weekly report markdown",
			"week_id": "ISO week id",
		},
		Outputs: map[string]string{
			"json":               "Publish result",
			"formalized_content": "Human-readable publish summary",
		},
		InputForm: map[string]any{
			"content": map[string]any{"type": "line", "name": "Content"},
			"week_id": map[string]any{"type": "line", "name": "Week id"},
		},
	}
}

func (d *DatasetWriteTool) BuildComponentOutputs(envelope map[string]any) map[string]any {
	out := map[string]any{}
	for _, key := range []string{"json", "formalized_content", "_ERROR"} {
		if v, ok := envelope[key]; ok {
			out[key] = v
		}
	}
	return out
}

func normalizeWeeklyOutputFormat(value string) (string, error) {
	key := strings.TrimSpace(strings.ToLower(value))
	if key == "" {
		return "md", nil
	}
	key = strings.TrimPrefix(key, ".")
	switch key {
	case "md", "markdown":
		return "md", nil
	case "docx", "doc":
		return "docx", nil
	case "pdf":
		return "pdf", nil
	default:
		return "", fmt.Errorf("output_format must be one of md, docx, pdf, got %q", value)
	}
}

func weeklyReportFilename(weekID, outputFormat string) (string, error) {
	if !weekIDRE.MatchString(weekID) {
		return "", fmt.Errorf("week_id must look like YYYY-Www, got %q", weekID)
	}
	format, err := normalizeWeeklyOutputFormat(outputFormat)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("weekly-report-%s.%s", weekID, format), nil
}

func buildWeeklyReportFile(weekID, content, outputFormat string) (string, []byte, error) {
	filename, err := weeklyReportFilename(weekID, outputFormat)
	if err != nil {
		return "", nil, err
	}
	format, err := normalizeWeeklyOutputFormat(outputFormat)
	if err != nil {
		return "", nil, err
	}
	body, err := renderWeeklyReport(content, format)
	if err != nil {
		return "", nil, err
	}
	return filename, body, nil
}

func renderWeeklyReport(content, outputFormat string) ([]byte, error) {
	format, err := normalizeWeeklyOutputFormat(outputFormat)
	if err != nil {
		return nil, err
	}
	switch format {
	case "md":
		return []byte(content), nil
	case "docx":
		return markdownToDocx(content), nil
	case "pdf":
		return markdownToPDF(content), nil
	default:
		return nil, fmt.Errorf("output_format must be one of md, docx, pdf, got %q", outputFormat)
	}
}

func markdownBlocks(content string) [][2]string {
	var blocks [][2]string
	for _, raw := range strings.Split(content, "\n") {
		line := strings.TrimRight(raw, " \t")
		if strings.TrimSpace(line) == "" {
			continue
		}
		switch {
		case strings.HasPrefix(line, "### "):
			blocks = append(blocks, [2]string{"h3", strings.TrimSpace(line[4:])})
		case strings.HasPrefix(line, "## "):
			blocks = append(blocks, [2]string{"h2", strings.TrimSpace(line[3:])})
		case strings.HasPrefix(line, "# "):
			blocks = append(blocks, [2]string{"h1", strings.TrimSpace(line[2:])})
		case strings.HasPrefix(line, "- "), strings.HasPrefix(line, "* "):
			blocks = append(blocks, [2]string{"li", strings.TrimSpace(line[2:])})
		default:
			blocks = append(blocks, [2]string{"p", line})
		}
	}
	return blocks
}

func markdownToDocx(content string) []byte {
	var documentXML strings.Builder
	documentXML.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`)
	documentXML.WriteString(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>`)
	blocks := markdownBlocks(content)
	if len(blocks) == 0 {
		documentXML.WriteString(`<w:p><w:r><w:t></w:t></w:r></w:p>`)
	}
	for _, block := range blocks {
		text := html.EscapeString(block[1])
		switch block[0] {
		case "h1":
			documentXML.WriteString(`<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t xml:space="preserve">` + text + `</w:t></w:r></w:p>`)
		case "h2", "h3":
			documentXML.WriteString(`<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t xml:space="preserve">` + text + `</w:t></w:r></w:p>`)
		default:
			documentXML.WriteString(`<w:p><w:r><w:t xml:space="preserve">` + text + `</w:t></w:r></w:p>`)
		}
	}
	documentXML.WriteString(`<w:sectPr/></w:body></w:document>`)

	var buf bytes.Buffer
	archive := zip.NewWriter(&buf)
	files := map[string]string{
		"[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
			`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
			`<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
			`<Default Extension="xml" ContentType="application/xml"/>` +
			`<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
			`</Types>`,
		"_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
			`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
			`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
			`</Relationships>`,
		"word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
			`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`,
		"word/document.xml": documentXML.String(),
	}
	for _, name := range []string{"[Content_Types].xml", "_rels/.rels", "word/_rels/document.xml.rels", "word/document.xml"} {
		writer, err := archive.Create(name)
		if err != nil {
			continue
		}
		_, _ = writer.Write([]byte(files[name]))
	}
	_ = archive.Close()
	return buf.Bytes()
}

func markdownToPDF(content string) []byte {
	// Minimal PDF. CJK is stored as UTF-16BE so the bytes remain a valid PDF;
	// the Python DatasetWrite canvas is the scheduled publish path and uses STSong-Light.
	var text strings.Builder
	for _, block := range markdownBlocks(content) {
		if text.Len() > 0 {
			text.WriteByte('\n')
		}
		text.WriteString(block[1])
	}
	escaped := strings.ReplaceAll(text.String(), `\`, `\\`)
	escaped = strings.ReplaceAll(escaped, `(`, `\(`)
	escaped = strings.ReplaceAll(escaped, `)`, `\)`)
	stream := fmt.Sprintf("BT /F1 11 Tf 50 780 Td (%s) Tj ET", escaped)
	var b strings.Builder
	write := func(s string) { b.WriteString(s) }
	write("%PDF-1.4\n")
	offsets := make([]int, 6)
	offsets[1] = b.Len()
	write("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n")
	offsets[2] = b.Len()
	write("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n")
	offsets[3] = b.Len()
	write("3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n")
	offsets[4] = b.Len()
	write(fmt.Sprintf("4 0 obj << /Length %d >> stream\n%s\nendstream endobj\n", len(stream), stream))
	offsets[5] = b.Len()
	write("5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n")
	xref := b.Len()
	write("xref\n0 6\n0000000000 65535 f \n")
	for i := 1; i <= 5; i++ {
		write(fmt.Sprintf("%010d 00000 n \n", offsets[i]))
	}
	write(fmt.Sprintf("trailer << /Size 6 /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", xref))
	return []byte(b.String())
}

var _ ToolComponent = (*DatasetWriteTool)(nil)
