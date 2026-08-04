module example.com/shortcode-smoke-fixture

go 1.22

require (
	github.com/alex-feel/hugo-artifacts/shortcodes/arxiv-paper v0.0.0-00010101000000-000000000000
	github.com/alex-feel/hugo-artifacts/shortcodes/callout v0.0.0-00010101000000-000000000000
	github.com/alex-feel/hugo-artifacts/shortcodes/github-repo v0.0.0-00010101000000-000000000000
	github.com/alex-feel/hugo-artifacts/shortcodes/hf-space v0.0.0-00010101000000-000000000000
	github.com/alex-feel/hugo-artifacts/shortcodes/youtube-embed v0.0.0-00010101000000-000000000000
)

replace github.com/alex-feel/hugo-artifacts/shortcodes/arxiv-paper => ../../arxiv-paper

replace github.com/alex-feel/hugo-artifacts/shortcodes/callout => ../../callout

replace github.com/alex-feel/hugo-artifacts/shortcodes/github-repo => ../../github-repo

replace github.com/alex-feel/hugo-artifacts/shortcodes/hf-space => ../../hf-space

replace github.com/alex-feel/hugo-artifacts/shortcodes/youtube-embed => ../../youtube-embed
