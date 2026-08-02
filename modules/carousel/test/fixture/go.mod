module example.com/carousel-fixture

go 1.22

require (
	github.com/alex-feel/hugo-artifacts/modules/carousel v0.0.0-00010101000000-000000000000
	github.com/alex-feel/hugo-artifacts/modules/images v0.0.0-00010101000000-000000000000
)

replace github.com/alex-feel/hugo-artifacts/modules/carousel => ../../

replace github.com/alex-feel/hugo-artifacts/modules/images => ../../../images
