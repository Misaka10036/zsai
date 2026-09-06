package tool

import (
	"archive/zip"
	"bytes"
	"context"
	"strings"
	"testing"
)

func TestWeeklyReportFilenameFollowsFormat(t *testing.T) {
	name, err := weeklyReportFilename("2026-W33", "docx")
	if err != nil {
		t.Fatal(err)
	}
	if name != "weekly-report-2026-W33.docx" {
		t.Fatalf("filename = %q", name)
	}
	if _, err := weeklyReportFilename("bad", "md"); err == nil {
		t.Fatal("expected invalid week_id error")
	}
	if _, err := weeklyReportFilename("2026-W33", "xlsx"); err == nil {
		t.Fatal("expected invalid output_format error")
	}
}

func TestRenderWeeklyReportDocxContainsProbe(t *testing.T) {
	blob, err := renderWeeklyReport("## 摘要\nWEEKLY-REPORT-PROBE", "docx")
	if err != nil {
		t.Fatal(err)
	}
	if len(blob) < 2 || blob[0] != 'P' || blob[1] != 'K' {
		t.Fatalf("docx should be a zip, got %q", blob[:min(8, len(blob))])
	}
	reader, err := zip.NewReader(bytes.NewReader(blob), int64(len(blob)))
	if err != nil {
		t.Fatal(err)
	}
	var xml string
	for _, file := range reader.File {
		if file.Name != "word/document.xml" {
			continue
		}
		rc, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		buf := new(bytes.Buffer)
		if _, err := buf.ReadFrom(rc); err != nil {
			t.Fatal(err)
		}
		_ = rc.Close()
		xml = buf.String()
	}
	if !strings.Contains(xml, "WEEKLY-REPORT-PROBE") {
		t.Fatalf("docx xml missing probe: %s", xml)
	}
	if !strings.Contains(xml, "摘要") {
		t.Fatalf("docx xml missing heading: %s", xml)
	}
}

func TestDatasetWriteInvokableRunUsesOutputFormat(t *testing.T) {
	var got DatasetWriteRequest
	SetDatasetWriter(func(ctx context.Context, req DatasetWriteRequest) (*DatasetWriteResult, error) {
		got = req
		return &DatasetWriteResult{Action: "created", DocumentID: "d1", Filename: req.Filename}, nil
	})
	t.Cleanup(func() { SetDatasetWriter(nil) })

	tool := NewDatasetWriteToolWithDefaults(datasetWriteParams{
		DatasetIDs:   []string{"kb1"},
		OutputFormat: "docx",
	})
	raw, err := tool.InvokableRun(context.Background(), `{"week_id":"2026-W33","content":"## 摘要\nWEEKLY-REPORT-PROBE"}`)
	if err != nil {
		t.Fatal(err)
	}
	if got.Filename != "weekly-report-2026-W33.docx" {
		t.Fatalf("writer filename = %q", got.Filename)
	}
	if !bytes.Equal(got.Body, markdownToDocx("## 摘要\nWEEKLY-REPORT-PROBE")) {
		t.Fatal("writer body is not the rendered docx")
	}
	if !strings.Contains(raw, `"output_format":"docx"`) {
		t.Fatalf("result missing output_format: %s", raw)
	}
	if !strings.Contains(raw, "weekly-report-2026-W33.docx") {
		t.Fatalf("result missing filename: %s", raw)
	}
}
