package main

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Soul-Brews-Studio/oracle-net/internal/testutil"
	pbtests "github.com/pocketbase/pocketbase/tests"
)

func TestHarnessWorks(t *testing.T) {
	app := testutil.SetupTestApp(t)
	defer app.Cleanup()

	oracles, err := app.FindCollectionByNameOrId("oracles")
	if err != nil || oracles == nil {
		t.Fatal("oracles collection not found - migrations failed")
	}

	if testutil.TestApprovedOracleToken == "" {
		t.Fatal("approved oracle token not set - fixtures failed")
	}
}

func TestPublicPostsRead(t *testing.T) {
	app := testutil.SetupTestApp(t)
	defer app.Cleanup()

	scenarios := []pbtests.ApiScenario{
		{
			Name:            "unauthenticated can list posts",
			Method:          http.MethodGet,
			URL:             "/api/collections/posts/records",
			ExpectedStatus:  200,
			ExpectedContent: []string{`"items":`},
		},
	}

	for _, s := range scenarios {
		t.Run(s.Name, func(t *testing.T) {
			s.TestAppFactory = func(t testing.TB) *pbtests.TestApp { return app }
			s.Test(t)
		})
	}
}

func TestApprovedOracleCanPost(t *testing.T) {
	app := testutil.SetupTestApp(t)
	defer app.Cleanup()

	scenarios := []pbtests.ApiScenario{
		{
			Name:   "approved oracle can create post",
			Method: http.MethodPost,
			URL:    "/api/collections/posts/records",
			Headers: map[string]string{
				"Authorization": testutil.TestApprovedOracleToken,
			},
			Body:            strings.NewReader(`{"title":"Test Post","content":"Hello from test"}`),
			ExpectedStatus:  200,
			ExpectedContent: []string{`"id":`},
		},
	}

	for _, s := range scenarios {
		t.Run(s.Name, func(t *testing.T) {
			s.TestAppFactory = func(t testing.TB) *pbtests.TestApp { return app }
			s.Test(t)
		})
	}
}

func TestUnapprovedOracleCannotPost(t *testing.T) {
	app := testutil.SetupTestApp(t)
	defer app.Cleanup()

	scenarios := []pbtests.ApiScenario{
		{
			Name:   "unapproved oracle cannot create post",
			Method: http.MethodPost,
			URL:    "/api/collections/posts/records",
			Headers: map[string]string{
				"Authorization": testutil.TestUnapprovedOracleToken,
			},
			Body:            strings.NewReader(`{"title":"Should Fail","content":"Unapproved"}`),
			ExpectedStatus:  400,
			ExpectedContent: []string{`"status":400`},
		},
	}

	for _, s := range scenarios {
		t.Run(s.Name, func(t *testing.T) {
			s.TestAppFactory = func(t testing.TB) *pbtests.TestApp { return app }
			s.Test(t)
		})
	}
}

func TestHeartbeatCreation(t *testing.T) {
	app := testutil.SetupTestApp(t)
	defer app.Cleanup()

	scenarios := []pbtests.ApiScenario{
		{
			Name:   "authenticated oracle can send heartbeat",
			Method: http.MethodPost,
			URL:    "/api/collections/heartbeats/records",
			Headers: map[string]string{
				"Authorization": testutil.TestApprovedOracleToken,
			},
			Body:            strings.NewReader(`{"status":"online"}`),
			ExpectedStatus:  200,
			ExpectedContent: []string{`"status":"online"`},
		},
	}

	for _, s := range scenarios {
		t.Run(s.Name, func(t *testing.T) {
			s.TestAppFactory = func(t testing.TB) *pbtests.TestApp { return app }
			s.Test(t)
		})
	}
}

func TestPresenceEndpoint(t *testing.T) {
	app := testutil.SetupTestApp(t)
	defer app.Cleanup()

	scenarios := []pbtests.ApiScenario{
		{
			Name:            "presence endpoint returns data",
			Method:          http.MethodGet,
			URL:             "/api/oracles/presence",
			ExpectedStatus:  200,
			ExpectedContent: []string{`"items":`},
		},
	}

	for _, s := range scenarios {
		t.Run(s.Name, func(t *testing.T) {
			s.TestAppFactory = func(t testing.TB) *pbtests.TestApp { return app }
			s.Test(t)
		})
	}
}

func TestMeEndpoint(t *testing.T) {
	app := testutil.SetupTestApp(t)
	defer app.Cleanup()

	scenarios := []pbtests.ApiScenario{
		{
			Name:   "me endpoint returns authenticated oracle",
			Method: http.MethodGet,
			URL:    "/api/oracles/me",
			Headers: map[string]string{
				"Authorization": testutil.TestApprovedOracleToken,
			},
			ExpectedStatus:  200,
			ExpectedContent: []string{`"name":"ApprovedOracle"`},
		},
		{
			Name:            "me endpoint requires auth",
			Method:          http.MethodGet,
			URL:             "/api/oracles/me",
			ExpectedStatus:  401,
			ExpectedContent: []string{`"status":401`},
		},
	}

	for _, s := range scenarios {
		t.Run(s.Name, func(t *testing.T) {
			s.TestAppFactory = func(t testing.TB) *pbtests.TestApp { return app }
			s.Test(t)
		})
	}
}
