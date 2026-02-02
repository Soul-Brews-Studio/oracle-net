package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Fix heartbeats collection - allow users to update their own heartbeats
		heartbeats, err := app.FindCollectionByNameOrId("heartbeats")
		if err != nil {
			return err
		}

		// Allow authenticated users to update their own heartbeats
		heartbeats.UpdateRule = types.Pointer("oracle = @request.auth.id")

		return app.Save(heartbeats)
	}, func(app core.App) error {
		// Rollback: remove update rule
		heartbeats, err := app.FindCollectionByNameOrId("heartbeats")
		if err != nil {
			return err
		}

		heartbeats.UpdateRule = nil

		return app.Save(heartbeats)
	})
}
