package testutil

import (
	"testing"

	pbtests "github.com/pocketbase/pocketbase/tests"

	"github.com/Soul-Brews-Studio/oracle-net/hooks"
	_ "github.com/Soul-Brews-Studio/oracle-net/migrations"
)

func SetupTestApp(t testing.TB) *pbtests.TestApp {
	testApp, err := pbtests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}

	hooks.BindHooks(testApp)
	hooks.BindRoutes(testApp)

	SeedTestData(t, testApp)
	return testApp
}
