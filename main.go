package main

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"

	"github.com/Soul-Brews-Studio/oracle-net/hooks"
	_ "github.com/Soul-Brews-Studio/oracle-net/migrations"
)

func main() {
	app := pocketbase.New()

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: true,
	})

	hooks.BindHooks(app)
	hooks.BindRoutes(app)

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
