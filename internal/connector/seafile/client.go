package seafile

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path"
	"strings"
	"time"
)

// Client talks to SeaFile api2 / via-repo-token endpoints.
type Client struct {
	BaseURL    string
	Token      string
	RepoToken  string
	HTTP       *http.Client
	Allowed    []string
	Timeout    time.Duration
}

func rewriteBaseURL(baseURL string) (string, []string) {
	baseURL = strings.TrimRight(baseURL, "/")
	parsed, err := url.Parse(baseURL)
	if err != nil || parsed.Hostname() == "" {
		return baseURL, nil
	}
	hosts := []string{parsed.Hostname()}
	if !strings.EqualFold(parsed.Hostname(), "host.docker.internal") {
		return baseURL, hosts
	}
	if _, err := os.Stat("/.dockerenv"); err == nil {
		return baseURL, hosts
	}
	if parsed.Port() != "" {
		parsed.Host = "127.0.0.1:" + parsed.Port()
	} else {
		parsed.Host = "127.0.0.1"
	}
	hosts = append(hosts, "127.0.0.1", "localhost")
	return strings.TrimRight(parsed.String(), "/"), hosts
}

func NewClient(baseURL, token, repoToken string, extraHosts []string) *Client {
	rewritten, rewriteHosts := rewriteBaseURL(baseURL)
	hosts := append([]string{}, extraHosts...)
	hosts = append(hosts, rewriteHosts...)
	if u, err := url.Parse(rewritten); err == nil && u.Hostname() != "" {
		hosts = append(hosts, u.Hostname())
	}
	baseURL = rewritten
	return &Client{
		BaseURL:   baseURL,
		Token:     token,
		RepoToken: repoToken,
		Allowed:   hosts,
		Timeout:   60 * time.Second,
		HTTP:      DialAllowlisted(hosts, 60*time.Second),
	}
}

func (c *Client) accountGet(endpoint string, query url.Values) (*http.Response, error) {
	if c.Token == "" {
		return nil, fmt.Errorf("seafile: account token not set")
	}
	reqURL := c.BaseURL + "/api2/" + strings.TrimLeft(endpoint, "/")
	if query != nil {
		reqURL += "?" + query.Encode()
	}
	req, err := http.NewRequest(http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Token "+c.Token)
	req.Header.Set("Accept", "application/json")
	return c.HTTP.Do(req)
}

func (c *Client) repoGet(endpoint string, query url.Values) (*http.Response, error) {
	if c.RepoToken == "" {
		return nil, fmt.Errorf("seafile: repo token not set")
	}
	reqURL := c.BaseURL + "/api/v2.1/via-repo-token/" + strings.TrimLeft(endpoint, "/")
	if query != nil {
		reqURL += "?" + query.Encode()
	}
	req, err := http.NewRequest(http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.RepoToken)
	req.Header.Set("Accept", "application/json")
	return c.HTTP.Do(req)
}

// DirEntry is a SeaFile directory listing item.
type DirEntry struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Type  string `json:"type"`
	Size  int64  `json:"size"`
	Mtime any    `json:"mtime"`
}

func (c *Client) ListLibraries() ([]map[string]any, error) {
	resp, err := c.accountGet("repos/", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("seafile: list libraries %s: %s", resp.Status, body)
	}
	var libraries []map[string]any
	if err := json.Unmarshal(body, &libraries); err != nil {
		return nil, err
	}
	return libraries, nil
}

func (c *Client) ListDir(repoID, path string) ([]DirEntry, error) {
	if path == "" {
		path = "/"
	}
	var resp *http.Response
	var err error
	if c.RepoToken != "" {
		resp, err = c.repoGet("dir/", url.Values{"path": {path}})
	} else {
		resp, err = c.accountGet("repos/"+repoID+"/dir/", url.Values{"p": {path}})
	}
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("seafile: list dir %s: %s", resp.Status, body)
	}
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var wrapped struct {
		DirentList []DirEntry `json:"dirent_list"`
	}
	if err := json.Unmarshal(raw, &wrapped); err == nil && wrapped.DirentList != nil {
		return wrapped.DirentList, nil
	}
	var entries []DirEntry
	if err := json.Unmarshal(raw, &entries); err != nil {
		return nil, err
	}
	return entries, nil
}

func (c *Client) DownloadLink(repoID, path string) (string, error) {
	var resp *http.Response
	var err error
	if c.RepoToken != "" {
		resp, err = c.repoGet("download-link/", url.Values{"path": {path}})
	} else {
		resp, err = c.accountGet("repos/"+repoID+"/file/", url.Values{"p": {path}, "reuse": {"1"}})
	}
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("seafile: download-link %s: %s", resp.Status, body)
	}
	return strings.Trim(strings.TrimSpace(string(body)), `"`), nil
}

func (c *Client) Download(link string) ([]byte, error) {
	req, err := http.NewRequest(http.MethodGet, link, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("seafile: download %s", resp.Status)
	}
	return io.ReadAll(io.LimitReader(resp.Body, 2<<20))
}

func parseSeafileLink(body []byte) string {
	var asString string
	if err := json.Unmarshal(body, &asString); err == nil && strings.TrimSpace(asString) != "" {
		return strings.TrimSpace(asString)
	}
	var asObj map[string]any
	if err := json.Unmarshal(body, &asObj); err == nil {
		for _, key := range []string{"url", "upload_link", "link"} {
			if v, ok := asObj[key].(string); ok && strings.TrimSpace(v) != "" {
				return strings.TrimSpace(v)
			}
		}
	}
	return strings.Trim(strings.TrimSpace(string(body)), `"`)
}

func (c *Client) parseLink(resp *http.Response) (string, error) {
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("seafile: link %s: %s", resp.Status, body)
	}
	link := parseSeafileLink(body)
	if link == "" {
		return "", fmt.Errorf("seafile: empty upload/update link")
	}
	rewritten, extra := rewriteBaseURL(link)
	c.Allowed = append(c.Allowed, extra...)
	return rewritten, nil
}

func (c *Client) UploadLink(repoID, parentDir string) (string, error) {
	if parentDir == "" {
		parentDir = "/"
	}
	var resp *http.Response
	var err error
	if c.RepoToken != "" {
		resp, err = c.repoGet("upload-link/", url.Values{"path": {parentDir}})
	} else {
		resp, err = c.accountGet("repos/"+repoID+"/upload-link/", url.Values{"p": {parentDir}})
	}
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	return c.parseLink(resp)
}

func (c *Client) UpdateLink(repoID, parentDir string) (string, error) {
	if parentDir == "" {
		parentDir = "/"
	}
	var resp *http.Response
	var err error
	if c.RepoToken != "" {
		resp, err = c.repoGet("update-link/", url.Values{"path": {parentDir}})
	} else {
		resp, err = c.accountGet("repos/"+repoID+"/update-link/", url.Values{"p": {parentDir}})
	}
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	return c.parseLink(resp)
}

func (c *Client) fileExists(repoID, dest string) bool {
	parent := path.Dir(dest)
	if parent == "." || parent == "" {
		parent = "/"
	}
	name := path.Base(dest)
	entries, err := c.ListDir(repoID, parent)
	if err != nil {
		return false
	}
	for _, entry := range entries {
		if entry.Name == name && entry.Type == "file" {
			return true
		}
	}
	return false
}

func (c *Client) postMultipart(link string, fields map[string]string, filename string, content []byte) error {
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	for key, value := range fields {
		if err := writer.WriteField(key, value); err != nil {
			return err
		}
	}
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return err
	}
	if _, err := part.Write(content); err != nil {
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, link, &buf)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("seafile: upload %s: %s", resp.Status, body)
	}
	return nil
}

func (c *Client) UpsertFile(repoID, parentDir, filename string, content []byte) (map[string]any, error) {
	if parentDir == "" {
		parentDir = "/"
	}
	filename = strings.TrimSpace(filename)
	if filename == "" || strings.ContainsAny(filename, `/\`) {
		return nil, fmt.Errorf("seafile: invalid filename %q", filename)
	}
	dest := "/" + filename
	if parentDir != "/" {
		dest = strings.TrimRight(parentDir, "/") + "/" + filename
	}
	if c.fileExists(repoID, dest) {
		link, err := c.UpdateLink(repoID, parentDir)
		if err != nil {
			return nil, err
		}
		if err := c.postMultipart(link, map[string]string{"filename": filename, "target_file": dest}, filename, content); err != nil {
			return nil, err
		}
		return map[string]any{"action": "replaced", "path": dest}, nil
	}
	link, err := c.UploadLink(repoID, parentDir)
	if err != nil {
		return nil, err
	}
	if !strings.Contains(link, "ret-json") {
		if strings.Contains(link, "?") {
			link += "&ret-json=1"
		} else {
			link += "?ret-json=1"
		}
	}
	if err := c.postMultipart(link, map[string]string{"parent_dir": parentDir, "replace": "1"}, filename, content); err != nil {
		return nil, err
	}
	return map[string]any{"action": "created", "path": dest}, nil
}
