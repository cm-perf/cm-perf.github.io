---
title: "DSC off. Sport+ stays: our BMW 428i development story"
date: "2026-10-26"
description: "Keep the Sport+ engine calibration, including sound, throttle response and aggression, when a long press turns DSC fully off. Developed on our BMW 428i for drift use."
tag: "428i · Development"
image: "/assets/gallery/flames/test-car-428i_optimized_.jpg"
imageAlt: "CM Performance BMW 428i development car"
imageCaption: "Our BMW 428i, the development car for retaining the Sport+ engine profile with DSC fully off."
draft: false
readerCheckout: "https://buy.stripe.com/5kQ14n7P51QObTA0lBcQU0b"
readerCodes:
  - SPORT50BBBCEC
  - SPORT505D3488
  - SPORT502FB307
  - SPORT50FE79BE
  - SPORT50E9D8A1
---

On our **BMW 428i**, Sport+ gave us the engine sound, throttle response and aggression we wanted for drifting. Holding the DSC button to turn traction control fully off brought back mild, Comfort-like engine behaviour.

For our drift use, that fallback was almost unusable. We wanted DSC fully off while keeping the engine calibration we had selected.

## Keep Sport+ when DSC is off

Our modification is designed to **retain the Sport+ engine calibration after the long press**.

This work concerns the engine profile. Dashboard labels, gearbox settings and chassis modes are separate.

## The idea in code

Illustrative pseudocode using invented names:

```python
# Before: the unwanted fallback
selected_profile = "Sport+"
dsc_state = "OFF"
engine_calibration = "Comfort-like"
```

```python
# Goal: keep the selected engine profile
if (selected_profile == "Sport+"
        and dsc_state == "OFF"):
    engine_calibration = "Sport+"
```

The actual implementation depends on the ECU software. These examples show the intended behaviour, without exposing the custom ROM details.

## Tested on our 428i

| Development car | Details |
| --- | --- |
| Vehicle | 2015 BMW 428i, F32 |
| Engine | N26 |
| DME diagnostic profile | Bosch `MEVD172P` |
| ECU software (SWFL) | `00001BC9-029.110.002` |
| Calibration software tag | `9VS9G01B` |
