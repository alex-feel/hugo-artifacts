module example.com/composition-fixture

go 1.22

require (
	github.com/alex-feel/hugo-artifacts/modules/agent-readiness v0.0.0-00010101000000-000000000000
	github.com/alex-feel/hugo-artifacts/modules/idb v0.0.0-20260802210047-4f8fca370e07
	github.com/alex-feel/hugo-artifacts/modules/pwa v0.0.0-00010101000000-000000000000
	github.com/alex-feel/hugo-artifacts/modules/search v0.0.0-00010101000000-000000000000
	github.com/alex-feel/hugo-artifacts/modules/seo v0.0.0-00010101000000-000000000000
	github.com/alex-feel/hugo-artifacts/modules/workbox v0.0.0-20260802210223-6fb48a799944
)

replace github.com/alex-feel/hugo-artifacts/modules/agent-readiness => ../../agent-readiness

replace github.com/alex-feel/hugo-artifacts/modules/idb => ../../idb

replace github.com/alex-feel/hugo-artifacts/modules/pwa => ../../pwa

replace github.com/alex-feel/hugo-artifacts/modules/search => ../../search

replace github.com/alex-feel/hugo-artifacts/modules/seo => ../../seo

replace github.com/alex-feel/hugo-artifacts/modules/workbox => ../../workbox
