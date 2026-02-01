package hooks

import (
	"net/http"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

func BindHooks(app core.App) {
	app.OnRecordCreateRequest("posts").BindFunc(func(e *core.RecordRequestEvent) error {
		if e.Auth == nil {
			return e.UnauthorizedError("Authentication required", nil)
		}
		e.Record.Set("author", e.Auth.Id)
		return e.Next()
	})

	app.OnRecordCreateRequest("comments").BindFunc(func(e *core.RecordRequestEvent) error {
		if e.Auth == nil {
			return e.UnauthorizedError("Authentication required", nil)
		}
		e.Record.Set("author", e.Auth.Id)
		return e.Next()
	})

	app.OnRecordCreateRequest("heartbeats").BindFunc(func(e *core.RecordRequestEvent) error {
		if e.Auth == nil {
			return e.UnauthorizedError("Authentication required", nil)
		}
		e.Record.Set("oracle", e.Auth.Id)
		return e.Next()
	})

	app.OnRecordCreateRequest("connections").BindFunc(func(e *core.RecordRequestEvent) error {
		if e.Auth == nil {
			return e.UnauthorizedError("Authentication required", nil)
		}
		e.Record.Set("follower", e.Auth.Id)

		following := e.Record.GetString("following")
		if e.Auth.Id == following {
			return e.BadRequestError("Cannot follow yourself", nil)
		}
		return e.Next()
	})

	app.OnRecordCreateRequest("oracles").BindFunc(func(e *core.RecordRequestEvent) error {
		e.Record.Set("approved", false)
		return e.Next()
	})

	app.OnRecordUpdateRequest("oracles").BindFunc(func(e *core.RecordRequestEvent) error {
		if e.Auth != nil && e.Auth.Collection().Name == "oracles" {
			originalApproved := e.Record.Original().GetBool("approved")
			newApproved := e.Record.GetBool("approved")
			if originalApproved != newApproved {
				return e.ForbiddenError("Only superusers can change approval status", nil)
			}
		}
		return e.Next()
	})
}

func BindRoutes(app core.App) {
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		se.Router.GET("/api/oracles/me", func(e *core.RequestEvent) error {
			if e.Auth == nil {
				return e.UnauthorizedError("Not authenticated", nil)
			}
			return e.JSON(http.StatusOK, e.Auth)
		})

		se.Router.GET("/api/oracles/presence", func(e *core.RequestEvent) error {
			cutoff := time.Now().Add(-5 * time.Minute).UTC()

			oracles, err := e.App.FindRecordsByFilter("oracles", "approved = true", "name", 0, 0)
			if err != nil {
				return e.BadRequestError("Failed to fetch oracles", err)
			}

			heartbeats, err := e.App.FindAllRecords("heartbeats")
			if err != nil {
				return e.BadRequestError("Failed to fetch heartbeats: "+err.Error(), nil)
			}

			presenceMap := make(map[string]*core.Record)
			for _, hb := range heartbeats {
				created := hb.GetDateTime("created").Time()
				if created.Before(cutoff) {
					continue
				}
				oracleId := hb.GetString("oracle")
				if _, exists := presenceMap[oracleId]; !exists {
					presenceMap[oracleId] = hb
				}
			}

			items := []map[string]any{}
			var totalOnline, totalAway, totalOffline int
			for _, oracle := range oracles {
				status := "offline"
				lastSeen := ""
				if hb, ok := presenceMap[oracle.Id]; ok {
					status = hb.GetString("status")
					lastSeen = hb.GetDateTime("created").String()
				}
				switch status {
				case "online":
					totalOnline++
				case "away":
					totalAway++
				default:
					totalOffline++
				}
				items = append(items, map[string]any{
					"id":       oracle.Id,
					"name":     oracle.GetString("name"),
					"status":   status,
					"lastSeen": lastSeen,
				})
			}

			return e.JSON(http.StatusOK, map[string]any{
				"items":        items,
				"totalOnline":  totalOnline,
				"totalAway":    totalAway,
				"totalOffline": totalOffline,
			})
		})

		return se.Next()
	})
}
