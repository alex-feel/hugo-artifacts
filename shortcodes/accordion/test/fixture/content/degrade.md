---
title: 'Degradation'
---

Every input problem the module tolerates, each rendering something usable and warning exactly once.

## Empty container

{{< accordion >}}

{{< /accordion >}}

## Unknown container parameter

{{< accordion colour="blue" >}}

{{< accordion-item "Unknown container param" >}}

Body.

{{< /accordion-item >}}

{{< /accordion >}}

## Unknown item parameter

{{< accordion >}}

{{< accordion-item title="Unknown item param" expanded="true" >}}

Body.

{{< /accordion-item >}}

{{< /accordion >}}

## Positional container arguments

{{< accordion "not a parameter" >}}

{{< accordion-item "Positional container args" >}}

Body.

{{< /accordion-item >}}

{{< /accordion >}}

## Unrecognized boolean token

{{< accordion >}}

{{< accordion-item title="Bad bool" open="maybe" >}}

Body.

{{< /accordion-item >}}

{{< /accordion >}}

## Invalid heading level

{{< accordion heading="9" >}}

{{< accordion-item "Bad heading" >}}

Body.

{{< /accordion-item >}}

{{< /accordion >}}

## Icon suppressed

{{< accordion icon="false" >}}

{{< accordion-item "No icon" >}}

Body.

{{< /accordion-item >}}

{{< /accordion >}}

## An item whose body is blank

{{< accordion >}}

{{< accordion-item "Empty body" >}}{{< /accordion-item >}}

{{< /accordion >}}

