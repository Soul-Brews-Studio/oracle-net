package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		// Add oracle_name field to oracles collection
		// This separates Oracle identity from Human identity:
		// - name = human's display name (github_username)
		// - oracle_name = Oracle's name (e.g., "SHRIMP Oracle")
		oracles, err := app.FindCollectionByNameOrId("oracles")
		if err != nil {
			return err
		}

		// oracle_name: The Oracle's name (from birth issue title)
		oracles.Fields.Add(&core.TextField{Name: "oracle_name", Max: 100})

		return app.Save(oracles)
	}, func(app core.App) error {
		// Rollback: remove the oracle_name field
		oracles, err := app.FindCollectionByNameOrId("oracles")
		if err != nil {
			return err
		}

		oracles.Fields.RemoveByName("oracle_name")

		return app.Save(oracles)
	})
}
