# Helper

A supporting document belonging to a DIFFERENT skill than `fixture-prefix`, in a directory whose name begins with that skill's own.

It exists so the probe that must never be issued would succeed if it were: a guard comparing paths without the trailing separator resolves `../fixture-prefix-sibling/HELPER.md` to a path that starts with `/fixture-prefix`, admits it as a file inside the skill, fetches this document, and reports `fixture-prefix` as a multi-file skill on the strength of somebody else's file. Were this document absent, that probe would 404 and the wrong verdict would look like the right one.
