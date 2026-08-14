package tool

import (
	"context"
	"errors"
	"sync"
)

var errConnectorLookupMissing = errors.New("seafile: connector lookup is not wired")

// ConnectorSnapshot is the subset of a data-source connector row the Seafile
// tool needs. Tokens stay here, never in DSL.
type ConnectorSnapshot struct {
	ID       string
	TenantID string
	Source   string
	Config   map[string]any
}

// ConnectorLookup loads a tenant-accessible connector by id.
type ConnectorLookup func(ctx context.Context, connectorID, userID string) (*ConnectorSnapshot, error)

var (
	connectorLookupMu sync.RWMutex
	connectorLookup   ConnectorLookup
)

// SetConnectorLookup installs the connector resolver used by Seafile.
func SetConnectorLookup(fn ConnectorLookup) {
	connectorLookupMu.Lock()
	defer connectorLookupMu.Unlock()
	connectorLookup = fn
}

func lookupConnector(ctx context.Context, connectorID, userID string) (*ConnectorSnapshot, error) {
	connectorLookupMu.RLock()
	fn := connectorLookup
	connectorLookupMu.RUnlock()
	if fn == nil {
		return nil, errConnectorLookupMissing
	}
	return fn(ctx, connectorID, userID)
}
