package testutil

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	pbtests "github.com/pocketbase/pocketbase/tests"
)

type TestFixtures struct {
	SuperuserToken        string
	ApprovedOracleToken   string
	UnapprovedOracleToken string
	ApprovedOracleID      string
	UnapprovedOracleID    string
}

var (
	TestSuperuserToken        string
	TestApprovedOracleToken   string
	TestUnapprovedOracleToken string
	TestApprovedOracleID      string
	TestUnapprovedOracleID    string
)

func SeedTestData(t testing.TB, app *pbtests.TestApp) *TestFixtures {
	fixtures := &TestFixtures{}

	superusers, err := app.FindCollectionByNameOrId("_superusers")
	if err != nil {
		t.Fatalf("failed to find superusers collection: %v", err)
	}
	superuser := core.NewRecord(superusers)
	superuser.Set("email", "admin@test.local")
	superuser.Set("password", "testpass123")
	if err := app.Save(superuser); err != nil {
		t.Fatalf("failed to create superuser: %v", err)
	}
	token, _ := superuser.NewAuthToken()
	fixtures.SuperuserToken = token
	TestSuperuserToken = token

	oracles, err := app.FindCollectionByNameOrId("oracles")
	if err != nil {
		t.Fatalf("failed to find oracles collection: %v", err)
	}

	approvedOracle := core.NewRecord(oracles)
	approvedOracle.Set("email", "approved@test.local")
	approvedOracle.Set("password", "testpass123")
	approvedOracle.Set("name", "ApprovedOracle")
	approvedOracle.Set("approved", true)
	if err := app.Save(approvedOracle); err != nil {
		t.Fatalf("failed to create approved oracle: %v", err)
	}
	token, _ = approvedOracle.NewAuthToken()
	fixtures.ApprovedOracleToken = token
	fixtures.ApprovedOracleID = approvedOracle.Id
	TestApprovedOracleToken = token
	TestApprovedOracleID = approvedOracle.Id

	unapprovedOracle := core.NewRecord(oracles)
	unapprovedOracle.Set("email", "unapproved@test.local")
	unapprovedOracle.Set("password", "testpass123")
	unapprovedOracle.Set("name", "UnapprovedOracle")
	unapprovedOracle.Set("approved", false)
	if err := app.Save(unapprovedOracle); err != nil {
		t.Fatalf("failed to create unapproved oracle: %v", err)
	}
	token, _ = unapprovedOracle.NewAuthToken()
	fixtures.UnapprovedOracleToken = token
	fixtures.UnapprovedOracleID = unapprovedOracle.Id
	TestUnapprovedOracleToken = token
	TestUnapprovedOracleID = unapprovedOracle.Id

	return fixtures
}
