module example.com/agent-readiness-fixture-widgets

go 1.22

require (
	github.com/alex-feel/hugo-artifacts/modules/agent-readiness v0.0.0-00010101000000-000000000000
	github.com/alex-feel/hugo-artifacts/modules/images v0.0.0-00010101000000-000000000000
	github.com/alex-feel/hugo-artifacts/shortcodes/arxiv-paper v0.0.0-00010101000000-000000000000
	github.com/alex-feel/hugo-artifacts/shortcodes/callout v0.0.0-00010101000000-000000000000
	github.com/alex-feel/hugo-artifacts/shortcodes/github-profile v0.0.0-00010101000000-000000000000
	github.com/alex-feel/hugo-artifacts/shortcodes/github-repo v0.0.0-00010101000000-000000000000
	github.com/alex-feel/hugo-artifacts/shortcodes/hf-space v0.0.0-00010101000000-000000000000
	github.com/alex-feel/hugo-artifacts/shortcodes/youtube-embed v0.0.0-00010101000000-000000000000
)

replace github.com/alex-feel/hugo-artifacts/modules/agent-readiness => ../../

replace github.com/alex-feel/hugo-artifacts/modules/images => ../../../images

replace github.com/alex-feel/hugo-artifacts/shortcodes/arxiv-paper => ../../../../shortcodes/arxiv-paper

replace github.com/alex-feel/hugo-artifacts/shortcodes/callout => ../../../../shortcodes/callout

replace github.com/alex-feel/hugo-artifacts/shortcodes/github-profile => ../../../../shortcodes/github-profile

replace github.com/alex-feel/hugo-artifacts/shortcodes/github-repo => ../../../../shortcodes/github-repo

replace github.com/alex-feel/hugo-artifacts/shortcodes/hf-space => ../../../../shortcodes/hf-space

replace github.com/alex-feel/hugo-artifacts/shortcodes/youtube-embed => ../../../../shortcodes/youtube-embed
