package tool

import (
	"context"
	"encoding/json"
	"fmt"
	"path"
	"strings"
	"time"

	"github.com/cloudwego/eino/components/tool"
	"github.com/cloudwego/eino/schema"

	"ragflow/internal/agent/runtime"
	"ragflow/internal/connector/seafile"
)

const seafileToolName = "seafile_browse"

type seafileParams struct {
	ConnectorID    string
	DefaultRepoID  string
	Path           string
	WeekMode       string
	Timezone       string
	FilenameRegex  string
	DownloadHosts  []string
	RequireComplete bool
}

type SeafileTool struct {
	defaults seafileParams
}

func NewSeafileTool() *SeafileTool {
	return NewSeafileToolWithDefaults(seafileParams{WeekMode: "this_week", Timezone: "Asia/Shanghai"})
}

func NewSeafileToolWithDefaults(defaults seafileParams) *SeafileTool {
	if defaults.WeekMode == "" {
		defaults.WeekMode = "this_week"
	}
	if defaults.Timezone == "" {
		defaults.Timezone = "Asia/Shanghai"
	}
	return &SeafileTool{defaults: defaults}
}

func (s *SeafileTool) Info(_ context.Context) (*schema.ToolInfo, error) {
	return &schema.ToolInfo{
		Name: seafileToolName,
		Desc: "List and download daily-report files from a configured SeaFile data source.",
		ParamsOneOf: schema.NewParamsOneOfByParams(map[string]*schema.ParameterInfo{
			"action": {Type: schema.String, Desc: "search (default), list_dir, or download", Required: false},
			"path":   {Type: schema.String, Desc: "Directory or file path", Required: false},
			"repo_id": {Type: schema.String, Desc: "Library id; ignored for scoped connectors", Required: false},
		}),
	}, nil
}

func (s *SeafileTool) InvokableRun(ctx context.Context, argsJSON string, _ ...tool.Option) (string, error) {
	args := map[string]any{}
	if strings.TrimSpace(argsJSON) != "" {
		if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
			return seafileErrJSON(fmt.Errorf("invalid arguments: %w", err)), nil
		}
	}
	action, _ := args["action"].(string)
	if action == "" {
		action = "search"
	}
	snapshot, err := s.loadConnector(ctx)
	if err != nil {
		return seafileErrJSON(err), nil
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
	client := seafile.NewClient(baseURL, token, repoToken, s.defaults.DownloadHosts)

	syncScope, _ := cfg["sync_scope"].(string)
	scopeRepo, _ := cfg["repo_id"].(string)
	syncPath, _ := cfg["sync_path"].(string)
	targets, filePath, err := resolveSeafileTargets(client, syncScope, scopeRepo, syncPath, s.defaults, args)
	if err != nil {
		return seafileErrJSON(err), nil
	}

	payload := map[string]any{
		"coverage_status": "complete",
		"path":            filePath,
	}
	if len(targets) == 1 {
		payload["repo_id"] = targets[0]
	}
	switch strings.ToLower(action) {
	case "list_dir":
		entries, err := client.ListDir(targets[0], filePath)
		if err != nil {
			return seafileErrJSON(err), nil
		}
		payload["entries"] = entries
	case "download":
		link, err := client.DownloadLink(targets[0], filePath)
		if err != nil {
			return seafileErrJSON(err), nil
		}
		blob, err := client.Download(link)
		if err != nil {
			return seafileErrJSON(err), nil
		}
		payload["file"] = map[string]any{"path": filePath, "name": path.Base(filePath), "size": len(blob)}
	default:
		var files []seafile.DirEntry
		for _, repoID := range targets {
			entries, err := client.ListDir(repoID, filePath)
			if err != nil {
				continue
			}
			files = append(files, entries...)
		}
		payload["files"] = files
		payload["received_count"] = len(files)
		if len(files) == 0 {
			payload["coverage_status"] = "empty"
		}
		payload["week_id"] = isoWeekID(time.Now())
		payload["previous_week_id"] = previousIsoWeekID(time.Now())
	}
	raw, err := json.Marshal(map[string]any{"json": payload, "formalized_content": fmt.Sprintf("Seafile %s returned %v", action, payload["received_count"])})
	if err != nil {
		return seafileErrJSON(err), nil
	}
	return string(raw), nil
}

func (s *SeafileTool) loadConnector(ctx context.Context) (*ConnectorSnapshot, error) {
	if s.defaults.ConnectorID == "" {
		return nil, fmt.Errorf("seafile: connector_id is required")
	}
	userID := ""
	if state, _, err := runtime.GetStateFromContext[*runtime.CanvasState](ctx); err == nil && state != nil {
		userID = strings.TrimSpace(fmt.Sprint(state.Sys["user_id"]))
		if userID == "" {
			userID = strings.TrimSpace(fmt.Sprint(state.Sys["tenant_id"]))
		}
	}
	snapshot, err := lookupConnector(ctx, s.defaults.ConnectorID, userID)
	if err != nil {
		return nil, err
	}
	if snapshot == nil || !strings.EqualFold(snapshot.Source, "seafile") {
		return nil, fmt.Errorf("seafile: connector is not a seafile source")
	}
	return snapshot, nil
}

func resolveSeafileTargets(client *seafile.Client, syncScope, scopeRepo, syncPath string, defaults seafileParams, args map[string]any) ([]string, string, error) {
	requestedRepo, _ := args["repo_id"].(string)
	requestedPath, _ := args["path"].(string)
	if requestedPath == "" {
		requestedPath = defaults.Path
	}
	if requestedPath == "" {
		requestedPath = syncPath
	}
	if requestedPath == "" {
		requestedPath = "/"
	}
	syncScope = strings.ToLower(syncScope)
	if syncScope == "library" || syncScope == "directory" {
		if requestedRepo != "" && requestedRepo != scopeRepo {
			return nil, "", fmt.Errorf("seafile: repo_id is locked to the connector library")
		}
		if syncScope == "directory" && !pathInScope(requestedPath, syncPath) {
			return nil, "", fmt.Errorf("seafile: path %q is outside connector sync_path", requestedPath)
		}
		return []string{scopeRepo}, requestedPath, nil
	}
	repoID := strings.TrimSpace(requestedRepo)
	if repoID == "" {
		repoID = strings.TrimSpace(defaults.DefaultRepoID)
	}
	if repoID == "" {
		repoID = strings.TrimSpace(scopeRepo)
	}
	if repoID != "" {
		return []string{repoID}, requestedPath, nil
	}
	libraries, err := client.ListLibraries()
	if err != nil {
		return nil, "", err
	}
	ids := make([]string, 0, len(libraries))
	for _, lib := range libraries {
		id, _ := lib["id"].(string)
		if strings.TrimSpace(id) != "" {
			ids = append(ids, id)
		}
	}
	if len(ids) == 0 {
		return nil, "", fmt.Errorf("当前 Seafile 账号下没有可访问的资料库")
	}
	return ids, requestedPath, nil
}

func pathInScope(p, syncPath string) bool {
	p = strings.TrimRight(p, "/")
	syncPath = strings.TrimRight(syncPath, "/")
	if syncPath == "" || syncPath == "/" {
		return true
	}
	return p == syncPath || strings.HasPrefix(p, syncPath+"/")
}

func isoWeekID(now time.Time) string {
	year, week := now.ISOWeek()
	return fmt.Sprintf("%d-W%02d", year, week)
}

func previousIsoWeekID(now time.Time) string {
	return isoWeekID(now.AddDate(0, 0, -7))
}

func seafileErrJSON(err error) string {
	raw, _ := json.Marshal(map[string]any{"_ERROR": err.Error(), "json": map[string]any{"coverage_status": "empty"}})
	return string(raw)
}

func (s *SeafileTool) ComponentSpec() ComponentSpec {
	return ComponentSpec{
		Inputs: map[string]string{
			"action": "search, list_dir, or download",
			"path":   "SeaFile path",
		},
		Outputs: map[string]string{
			"json":               "Search result including files and coverage_status",
			"formalized_content": "Daily-report text for the synthesizer",
		},
		InputForm: map[string]any{
			"action": map[string]any{"type": "options", "name": "Action"},
			"path":   map[string]any{"type": "line", "name": "Path"},
		},
	}
}

func (s *SeafileTool) BuildComponentOutputs(envelope map[string]any) map[string]any {
	out := map[string]any{}
	if v, ok := envelope["json"]; ok {
		out["json"] = v
	}
	if v, ok := envelope["formalized_content"]; ok {
		out["formalized_content"] = v
	}
	if v, ok := envelope["_ERROR"]; ok {
		out["_ERROR"] = v
	}
	return out
}

var _ ToolComponent = (*SeafileTool)(nil)
