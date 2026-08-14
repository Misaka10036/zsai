package seafile

import (
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// DialAllowlisted returns an HTTP client that only follows URLs whose host is
// in allowedHosts. Redirects are not followed. This is package-local and does
// not change the global SSRF helper.
func DialAllowlisted(allowedHosts []string, timeout time.Duration) *http.Client {
	allow := map[string]struct{}{}
	for _, host := range allowedHosts {
		host = strings.ToLower(strings.TrimSpace(host))
		if host != "" {
			allow[host] = struct{}{}
		}
	}
	if timeout <= 0 {
		timeout = 60 * time.Second
	}
	return &http.Client{
		Timeout: timeout,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
		Transport: &allowlistTransport{allow: allow, base: http.DefaultTransport},
	}
}

type allowlistTransport struct {
	allow map[string]struct{}
	base  http.RoundTripper
}

func (t *allowlistTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if err := assertHostAllowed(req.URL, t.allow); err != nil {
		return nil, err
	}
	return t.base.RoundTrip(req)
}

func assertHostAllowed(u *url.URL, allow map[string]struct{}) error {
	if u == nil {
		return fmt.Errorf("seafile: empty url")
	}
	host := strings.ToLower(u.Hostname())
	if host == "" {
		return fmt.Errorf("seafile: url has no host")
	}
	if mapped := mappedIPv4(host); mapped != "" {
		host = mapped
	}
	if _, ok := allow[host]; !ok {
		return fmt.Errorf("seafile: host %q is not on the allowlist", host)
	}
	return nil
}

func mappedIPv4(host string) string {
	ip := net.ParseIP(host)
	if ip == nil {
		return ""
	}
	v4 := ip.To4()
	if v4 == nil {
		return ""
	}
	return v4.String()
}
