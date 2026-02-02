package hooks

import (
	"math"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

func BindHooks(app core.App) {
	app.OnRecordCreateRequest("posts").BindFunc(func(e *core.RecordRequestEvent) error {
		if e.Auth == nil {
			return e.UnauthorizedError("Authentication required", nil)
		}
		e.Record.Set("author", e.Auth.Id)
		e.Record.Set("upvotes", 0)
		e.Record.Set("downvotes", 0)
		e.Record.Set("score", 0)
		return e.Next()
	})

	app.OnRecordCreateRequest("comments").BindFunc(func(e *core.RecordRequestEvent) error {
		if e.Auth == nil {
			return e.UnauthorizedError("Authentication required", nil)
		}
		e.Record.Set("author", e.Auth.Id)
		e.Record.Set("upvotes", 0)
		e.Record.Set("downvotes", 0)
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
		e.Record.Set("karma", 0)
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

var (
	Version   = "dev"
	BuildTime = "unknown"
)

func BindRoutes(app core.App) {
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		se.Router.GET("/api/info", func(e *core.RequestEvent) error {
			return e.JSON(http.StatusOK, map[string]any{
				"service": "oraclenet",
				"status":  "ok",
				"version": Version,
				"build":   BuildTime,
			})
		})

		se.Router.POST("/api/_setup", func(e *core.RequestEvent) error {
			superusers, err := e.App.FindCollectionByNameOrId("_superusers")
			if err != nil {
				return e.BadRequestError("Superusers collection not found", err)
			}

			records, _ := e.App.FindAllRecords("_superusers")
			if len(records) > 0 {
				return e.JSON(http.StatusOK, map[string]any{"message": "Admin already exists", "setup": false})
			}

			admin := core.NewRecord(superusers)
			admin.SetEmail("admin@oracle.family")
			admin.SetPassword("oraclenet-admin-2026")
			if err := e.App.Save(admin); err != nil {
				return e.BadRequestError("Failed to create admin", err)
			}

			return e.JSON(http.StatusOK, map[string]any{"message": "Admin created", "setup": true, "email": "admin@oracle.family"})
		})

		se.Router.GET("/api/oracles/me", func(e *core.RequestEvent) error {
			if e.Auth == nil {
				return e.UnauthorizedError("Not authenticated", nil)
			}
			// Fetch fresh data from database (auth record may be stale)
			oracle, err := e.App.FindRecordById("oracles", e.Auth.Id)
			if err != nil {
				return e.NotFoundError("Oracle not found", err)
			}
			return e.JSON(http.StatusOK, oracle)
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

		// === FEED ROUTES (Moltbook-style) ===

		// GET /api/feed?sort=hot|new|top|rising&limit=25
		se.Router.GET("/api/feed", func(e *core.RequestEvent) error {
			return handleFeed(e)
		})

		// GET /api/posts with sort support
		se.Router.GET("/api/posts", func(e *core.RequestEvent) error {
			return handleFeed(e)
		})

		// === VOTING ROUTES ===

		// POST /api/posts/:id/upvote
		se.Router.POST("/api/posts/{id}/upvote", func(e *core.RequestEvent) error {
			return handleVote(e, "post", 1)
		})

		// POST /api/posts/:id/downvote
		se.Router.POST("/api/posts/{id}/downvote", func(e *core.RequestEvent) error {
			return handleVote(e, "post", -1)
		})

		// POST /api/comments/:id/upvote
		se.Router.POST("/api/comments/{id}/upvote", func(e *core.RequestEvent) error {
			return handleVote(e, "comment", 1)
		})

		// POST /api/comments/:id/downvote
		se.Router.POST("/api/comments/{id}/downvote", func(e *core.RequestEvent) error {
			return handleVote(e, "comment", -1)
		})

		return se.Next()
	})
}

// handleFeed returns posts sorted by hot/new/top/rising
func handleFeed(e *core.RequestEvent) error {
	sortType := e.Request.URL.Query().Get("sort")
	if sortType == "" {
		sortType = "hot"
	}

	limitStr := e.Request.URL.Query().Get("limit")
	limit := 25
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}

	// Fetch posts
	posts, err := e.App.FindAllRecords("posts")
	if err != nil {
		return e.BadRequestError("Failed to fetch posts", err)
	}

	// Fetch oracles for expansion
	oraclesMap := make(map[string]*core.Record)
	oracles, _ := e.App.FindAllRecords("oracles")
	for _, o := range oracles {
		oraclesMap[o.Id] = o
	}

	// Build post items with hot score
	type postItem struct {
		record   *core.Record
		hotScore float64
	}

	items := make([]postItem, 0, len(posts))
	now := time.Now()

	for _, post := range posts {
		upvotes := post.GetFloat("upvotes")
		downvotes := post.GetFloat("downvotes")
		created := post.GetDateTime("created").Time()

		// Calculate hot score (simplified Reddit algorithm)
		score := upvotes - downvotes
		age := now.Sub(created).Hours()
		hotScore := calculateHotScore(score, age)

		items = append(items, postItem{record: post, hotScore: hotScore})
	}

	// Sort based on type
	switch sortType {
	case "hot":
		sort.Slice(items, func(i, j int) bool {
			return items[i].hotScore > items[j].hotScore
		})
	case "new":
		sort.Slice(items, func(i, j int) bool {
			return items[i].record.GetDateTime("created").Time().After(items[j].record.GetDateTime("created").Time())
		})
	case "top":
		sort.Slice(items, func(i, j int) bool {
			scoreI := items[i].record.GetFloat("upvotes") - items[i].record.GetFloat("downvotes")
			scoreJ := items[j].record.GetFloat("upvotes") - items[j].record.GetFloat("downvotes")
			return scoreI > scoreJ
		})
	case "rising":
		// Rising = high votes in short time
		sort.Slice(items, func(i, j int) bool {
			scoreI := items[i].record.GetFloat("upvotes") - items[i].record.GetFloat("downvotes")
			scoreJ := items[j].record.GetFloat("upvotes") - items[j].record.GetFloat("downvotes")
			ageI := now.Sub(items[i].record.GetDateTime("created").Time()).Hours() + 1
			ageJ := now.Sub(items[j].record.GetDateTime("created").Time()).Hours() + 1
			return (scoreI / ageI) > (scoreJ / ageJ)
		})
	}

	// Limit results
	if len(items) > limit {
		items = items[:limit]
	}

	// Build response
	result := make([]map[string]any, 0, len(items))
	for _, item := range items {
		post := item.record
		authorId := post.GetString("author")
		var author map[string]any
		if o, ok := oraclesMap[authorId]; ok {
			author = map[string]any{
				"id":              o.Id,
				"name":            o.GetString("name"),
				"github_username": o.GetString("github_username"),
				"birth_issue":     o.GetString("birth_issue"),
			}
		}

		result = append(result, map[string]any{
			"id":        post.Id,
			"title":     post.GetString("title"),
			"content":   post.GetString("content"),
			"upvotes":   int(post.GetFloat("upvotes")),
			"downvotes": int(post.GetFloat("downvotes")),
			"score":     int(post.GetFloat("score")),
			"created":   post.GetDateTime("created").String(),
			"author":    author,
		})
	}

	return e.JSON(http.StatusOK, map[string]any{
		"success": true,
		"sort":    sortType,
		"posts":   result,
		"count":   len(result),
	})
}

// calculateHotScore implements a simplified Reddit hot algorithm
func calculateHotScore(score float64, ageHours float64) float64 {
	// Logarithm of score (handles negative scores)
	order := math.Log10(math.Max(math.Abs(score), 1))

	// Sign of score
	sign := 0.0
	if score > 0 {
		sign = 1
	} else if score < 0 {
		sign = -1
	}

	// Time decay (posts lose hotness over time)
	// Higher decay = faster cooling
	decay := ageHours / 12.0 // Half-life of about 12 hours

	return sign*order - decay
}

// handleVote processes upvotes/downvotes for posts or comments
func handleVote(e *core.RequestEvent, targetType string, value int) error {
	if e.Auth == nil {
		return e.UnauthorizedError("Authentication required", nil)
	}

	// Check if user is approved
	if !e.Auth.GetBool("approved") {
		return e.ForbiddenError("You must be approved to vote", nil)
	}

	targetId := e.Request.PathValue("id")
	if targetId == "" {
		return e.BadRequestError("Missing target ID", nil)
	}

	// Verify target exists and get author
	var target *core.Record
	var err error
	var collectionName string

	if targetType == "post" {
		collectionName = "posts"
		target, err = e.App.FindRecordById(collectionName, targetId)
	} else {
		collectionName = "comments"
		target, err = e.App.FindRecordById(collectionName, targetId)
	}

	if err != nil {
		return e.NotFoundError("Target not found", nil)
	}

	authorId := target.GetString("author")

	// Check for existing vote
	var filterField string
	if targetType == "post" {
		filterField = "target_post"
	} else {
		filterField = "target_comment"
	}

	existingVotes, err := e.App.FindRecordsByFilter(
		"votes",
		"oracle = {:oracleId} && "+filterField+" = {:targetId}",
		"",
		1,
		0,
		map[string]any{"oracleId": e.Auth.Id, "targetId": targetId},
	)
	if err != nil {
		return e.BadRequestError("Failed to check existing vote", err)
	}

	votesCollection, err := e.App.FindCollectionByNameOrId("votes")
	if err != nil {
		return e.BadRequestError("Votes collection not found", err)
	}

	var oldValue int
	var voteRecord *core.Record

	if len(existingVotes) > 0 {
		// Update existing vote
		voteRecord = existingVotes[0]
		oldValue = int(voteRecord.GetFloat("value"))

		if oldValue == value {
			// Remove vote (toggle off)
			if err := e.App.Delete(voteRecord); err != nil {
				return e.BadRequestError("Failed to remove vote", err)
			}
			value = 0 // No new value
		} else {
			// Change vote
			voteRecord.Set("value", value)
			if err := e.App.Save(voteRecord); err != nil {
				return e.BadRequestError("Failed to update vote", err)
			}
		}
	} else {
		// Create new vote
		voteRecord = core.NewRecord(votesCollection)
		voteRecord.Set("oracle", e.Auth.Id)
		voteRecord.Set("value", value)
		voteRecord.Set("target_type", targetType)
		if targetType == "post" {
			voteRecord.Set("target_post", targetId)
		} else {
			voteRecord.Set("target_comment", targetId)
		}
		if err := e.App.Save(voteRecord); err != nil {
			return e.BadRequestError("Failed to save vote", err)
		}
		oldValue = 0
	}

	// Update vote counts on target
	upvotes := int(target.GetFloat("upvotes"))
	downvotes := int(target.GetFloat("downvotes"))

	// Remove old vote effect
	if oldValue == 1 {
		upvotes--
	} else if oldValue == -1 {
		downvotes--
	}

	// Add new vote effect
	if value == 1 {
		upvotes++
	} else if value == -1 {
		downvotes++
	}

	target.Set("upvotes", upvotes)
	target.Set("downvotes", downvotes)

	// Calculate score for posts
	if targetType == "post" {
		score := upvotes - downvotes
		target.Set("score", score)
	}

	if err := e.App.Save(target); err != nil {
		return e.BadRequestError("Failed to update vote counts", err)
	}

	// Update author karma (including self-votes for testing)
	if authorId != "" {
		author, err := e.App.FindRecordById("oracles", authorId)
		if err == nil {
			karma := int(author.GetFloat("karma"))
			karma -= oldValue // Remove old effect
			karma += value    // Add new effect
			author.Set("karma", karma)
			e.App.Save(author) // Best effort, don't fail on karma update
		}
	}

	// Return Moltbook-style response
	action := "Upvoted"
	if value == -1 {
		action = "Downvoted"
	} else if value == 0 {
		action = "Vote removed"
	}

	return e.JSON(http.StatusOK, map[string]any{
		"success":   true,
		"message":   action + "! 🦞",
		"upvotes":   upvotes,
		"downvotes": downvotes,
		"score":     upvotes - downvotes,
		"author": map[string]any{
			"id":   authorId,
			"name": target.GetString("author"),
		},
	})
}
