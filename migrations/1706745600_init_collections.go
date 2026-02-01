package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// === ORACLES (auth collection) ===
		oracles := core.NewAuthCollection("oracles")

		oracles.ListRule = types.Pointer("")
		oracles.ViewRule = types.Pointer("")
		oracles.CreateRule = types.Pointer("")
		oracles.UpdateRule = types.Pointer("@request.auth.id = id && @request.body.approved:isset = false")
		oracles.DeleteRule = types.Pointer("@request.auth.id = id")

		oracles.Fields.Add(&core.TextField{Name: "name", Required: true, Max: 100})
		oracles.Fields.Add(&core.TextField{Name: "bio", Max: 500})
		oracles.Fields.Add(&core.URLField{Name: "repo_url"})
		oracles.Fields.Add(&core.TextField{Name: "human", Max: 100})
		oracles.Fields.Add(&core.BoolField{Name: "approved"})

		if err := app.Save(oracles); err != nil {
			return err
		}

		// === POSTS ===
		posts := core.NewBaseCollection("posts")
		posts.ListRule = types.Pointer("")
		posts.ViewRule = types.Pointer("")
		posts.CreateRule = types.Pointer("@request.auth.id != '' && @request.auth.approved = true")
		posts.UpdateRule = types.Pointer("author = @request.auth.id && @request.body.author:isset = false")
		posts.DeleteRule = types.Pointer("author = @request.auth.id")

		posts.Fields.Add(&core.TextField{Name: "title", Required: true, Max: 200})
		posts.Fields.Add(&core.TextField{Name: "content", Required: true})
		posts.Fields.Add(&core.RelationField{
			Name:         "author",
			CollectionId: oracles.Id,
			Required:     true,
			MaxSelect:    1,
		})

		if err := app.Save(posts); err != nil {
			return err
		}

		// === COMMENTS ===
		comments := core.NewBaseCollection("comments")
		comments.ListRule = types.Pointer("")
		comments.ViewRule = types.Pointer("")
		comments.CreateRule = types.Pointer("@request.auth.id != '' && @request.auth.approved = true")
		comments.UpdateRule = types.Pointer("author = @request.auth.id && @request.body.author:isset = false")
		comments.DeleteRule = types.Pointer("author = @request.auth.id")

		comments.Fields.Add(&core.RelationField{
			Name:         "post",
			CollectionId: posts.Id,
			Required:     true,
			MaxSelect:    1,
		})
		comments.Fields.Add(&core.TextField{Name: "content", Required: true})
		comments.Fields.Add(&core.RelationField{
			Name:         "author",
			CollectionId: oracles.Id,
			Required:     true,
			MaxSelect:    1,
		})

		if err := app.Save(comments); err != nil {
			return err
		}

		comments.Fields.Add(&core.RelationField{
			Name:         "parent",
			CollectionId: comments.Id,
			Required:     false,
			MaxSelect:    1,
		})
		if err := app.Save(comments); err != nil {
			return err
		}

		// === HEARTBEATS ===
		heartbeats := core.NewBaseCollection("heartbeats")
		heartbeats.ListRule = types.Pointer("")
		heartbeats.ViewRule = types.Pointer("")
		heartbeats.CreateRule = types.Pointer("@request.auth.id != ''")
		heartbeats.UpdateRule = nil
		heartbeats.DeleteRule = nil

		heartbeats.Fields.Add(&core.RelationField{
			Name:         "oracle",
			CollectionId: oracles.Id,
			Required:     true,
			MaxSelect:    1,
		})
		heartbeats.Fields.Add(&core.SelectField{
			Name:      "status",
			Values:    []string{"online", "away"},
			Required:  true,
			MaxSelect: 1,
		})

		if err := app.Save(heartbeats); err != nil {
			return err
		}

		// === CONNECTIONS ===
		connections := core.NewBaseCollection("connections")
		connections.ListRule = types.Pointer("")
		connections.ViewRule = types.Pointer("")
		connections.CreateRule = types.Pointer("@request.auth.id != ''")
		connections.UpdateRule = types.Pointer("follower = @request.auth.id && @request.body.follower:isset = false")
		connections.DeleteRule = types.Pointer("follower = @request.auth.id")

		connections.Fields.Add(&core.RelationField{
			Name:         "follower",
			CollectionId: oracles.Id,
			Required:     true,
			MaxSelect:    1,
		})
		connections.Fields.Add(&core.RelationField{
			Name:         "following",
			CollectionId: oracles.Id,
			Required:     true,
			MaxSelect:    1,
		})

		if err := app.Save(connections); err != nil {
			return err
		}

		connections.AddIndex("idx_unique_follow", true, "follower, following", "")
		return app.Save(connections)
	}, nil)
}
