package tool

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"sync"

	"github.com/cloudwego/eino/components/tool"
	"github.com/cloudwego/eino/schema"
)

const datasetWriteToolName = "write_my_dataset"

var weeklyFilenameRE = regexp.MustCompile(`^weekly-report-\d{4}-W\d{2}\.md$`)
var weekIDRE = regexp.MustCompile(`^\d{4}-W\d{2}$`)

type DatasetWriteRequest struct {
	DatasetID string
	WeekID    string
	Filename  string
	Content   string
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
	DatasetIDs    []string
	PublishPolicy string
	Language      string
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
	filename := fmt.Sprintf("weekly-report-%s.md", weekID)
	if !weeklyFilenameRE.MatchString(filename) {
		return datasetWriteErrJSON(fmt.Errorf("computed filename rejected")), nil
	}
	if len(d.defaults.DatasetIDs) != 1 {
		return datasetWriteErrJSON(fmt.Errorf("DatasetWrite requires exactly one dataset_id")), nil
	}
	content, _ := args["content"].(string)
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
		Metadata:  map[string]any{"week_id": weekID, "kind": "weekly_report", "language": d.defaults.Language},
	})
	if err != nil {
		return datasetWriteErrJSON(err), nil
	}
	raw, _ := json.Marshal(map[string]any{
		"json": map[string]any{
			"action":      result.Action,
			"document_id": result.DocumentID,
			"filename":    result.Filename,
			"week_id":     weekID,
		},
		"formalized_content": fmt.Sprintf("Wrote %s (%s).", result.Filename, result.Action),
	})
	return string(raw), nil
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

var _ ToolComponent = (*DatasetWriteTool)(nil)
