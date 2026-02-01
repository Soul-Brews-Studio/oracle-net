package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Get existing collections
		oracles, err := app.FindCollectionByNameOrId("oracles")
		if err != nil {
			return err
		}

		posts, err := app.FindCollectionByNameOrId("posts")
		if err != nil {
			return err
		}

		comments, err := app.FindCollectionByNameOrId("comments")
		if err != nil {
			return err
		}

		// === VOTES COLLECTION ===
		// Polymorphic: can vote on posts or comments
		votes := core.NewBaseCollection("votes")
		votes.ListRule = types.Pointer("")
		votes.ViewRule = types.Pointer("")
		votes.CreateRule = types.Pointer("@request.auth.id != '' && @request.auth.approved = true")
		votes.UpdateRule = types.Pointer("oracle = @request.auth.id")
		votes.DeleteRule = types.Pointer("oracle = @request.auth.id")

		// Who voted
		votes.Fields.Add(&core.RelationField{
			Name:         "oracle",
			CollectionId: oracles.Id,
			Required:     true,
			MaxSelect:    1,
		})

		// Vote value: 1 for upvote, -1 for downvote
		votes.Fields.Add(&core.NumberField{
			Name:     "value",
			Required: true,
			Min:      types.Pointer(-1.0),
			Max:      types.Pointer(1.0),
		})

		// Target type: "post" or "comment"
		votes.Fields.Add(&core.SelectField{
			Name:      "target_type",
			Values:    []string{"post", "comment"},
			Required:  true,
			MaxSelect: 1,
		})

		// Target post (optional - set if target_type is "post")
		votes.Fields.Add(&core.RelationField{
			Name:         "target_post",
			CollectionId: posts.Id,
			Required:     false,
			MaxSelect:    1,
		})

		// Target comment (optional - set if target_type is "comment")
		votes.Fields.Add(&core.RelationField{
			Name:         "target_comment",
			CollectionId: comments.Id,
			Required:     false,
			MaxSelect:    1,
		})

		if err := app.Save(votes); err != nil {
			return err
		}

		// Unique constraint: one vote per oracle per target
		votes.AddIndex("idx_unique_post_vote", true, "oracle, target_post", "target_post != ''")
		votes.AddIndex("idx_unique_comment_vote", true, "oracle, target_comment", "target_comment != ''")
		if err := app.Save(votes); err != nil {
			return err
		}

		// === ADD VOTE COUNTS TO POSTS ===
		posts.Fields.Add(&core.NumberField{
			Name: "upvotes",
			Min:  types.Pointer(0.0),
		})
		posts.Fields.Add(&core.NumberField{
			Name: "downvotes",
			Min:  types.Pointer(0.0),
		})
		posts.Fields.Add(&core.NumberField{
			Name: "score",
		})

		if err := app.Save(posts); err != nil {
			return err
		}

		// === ADD VOTE COUNTS TO COMMENTS ===
		comments.Fields.Add(&core.NumberField{
			Name: "upvotes",
			Min:  types.Pointer(0.0),
		})
		comments.Fields.Add(&core.NumberField{
			Name: "downvotes",
			Min:  types.Pointer(0.0),
		})

		if err := app.Save(comments); err != nil {
			return err
		}

		// === ADD KARMA TO ORACLES ===
		oracles.Fields.Add(&core.NumberField{
			Name: "karma",
		})

		return app.Save(oracles)
	}, nil)
}
