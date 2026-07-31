module example.com/composition-fixture

go 1.22

require (
	github.com/alex-feel/hugo-artifacts/modules/agent-readiness v0.0.0-00010101000000-000000000000
	github.com/alex-feel/hugo-artifacts/modules/search v0.0.0-00010101000000-000000000000
	github.com/alex-feel/hugo-artifacts/modules/seo v0.0.0-00010101000000-000000000000
)

replace github.com/alex-feel/hugo-artifacts/modules/agent-readiness => ../../agent-readiness

replace github.com/alex-feel/hugo-artifacts/modules/search => ../../search

replace github.com/alex-feel/hugo-artifacts/modules/seo => ../../seo
