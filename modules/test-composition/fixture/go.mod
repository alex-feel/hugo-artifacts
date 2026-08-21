module example.com/composition-fixture

go 1.22

require (
	github.com/alex-feel/hugo-artifacts/modules/agent-readiness v0.0.0-00010101000000-000000000000
	github.com/alex-feel/hugo-artifacts/modules/carousel v0.0.0-00010101000000-000000000000
	github.com/alex-feel/hugo-artifacts/modules/idb v0.0.0-20260802210047-4f8fca370e07
	github.com/alex-feel/hugo-artifacts/modules/images v0.0.0-00010101000000-000000000000
	github.com/alex-feel/hugo-artifacts/modules/og-image v0.0.0-00010101000000-000000000000
	github.com/alex-feel/hugo-artifacts/modules/pwa v0.0.0-00010101000000-000000000000
	github.com/alex-feel/hugo-artifacts/modules/search v0.0.0-00010101000000-000000000000
	github.com/alex-feel/hugo-artifacts/modules/seo v0.0.0-00010101000000-000000000000
	github.com/alex-feel/hugo-artifacts/modules/social-share v0.0.0-00010101000000-000000000000
	github.com/alex-feel/hugo-artifacts/modules/url-retirement v0.0.0-00010101000000-000000000000
	github.com/alex-feel/hugo-artifacts/modules/workbox v0.0.0-20260802210223-6fb48a799944
	github.com/alex-feel/hugo-artifacts/shortcodes/callout v0.0.0-00010101000000-000000000000
)

replace github.com/alex-feel/hugo-artifacts/modules/agent-readiness => ../../agent-readiness

replace github.com/alex-feel/hugo-artifacts/modules/carousel => ../../carousel

replace github.com/alex-feel/hugo-artifacts/modules/images => ../../images

replace github.com/alex-feel/hugo-artifacts/modules/idb => ../../idb

replace github.com/alex-feel/hugo-artifacts/modules/og-image => ../../og-image

replace github.com/alex-feel/hugo-artifacts/modules/pwa => ../../pwa

replace github.com/alex-feel/hugo-artifacts/modules/search => ../../search

replace github.com/alex-feel/hugo-artifacts/modules/seo => ../../seo

replace github.com/alex-feel/hugo-artifacts/modules/social-share => ../../social-share

replace github.com/alex-feel/hugo-artifacts/modules/url-retirement => ../../url-retirement

replace github.com/alex-feel/hugo-artifacts/shortcodes/callout => ../../../shortcodes/callout

replace github.com/alex-feel/hugo-artifacts/modules/workbox => ../../workbox
