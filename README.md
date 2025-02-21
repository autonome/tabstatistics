# tabstatistics

An extension for showing real-time per-day stats:

Currently tracks:

- # tab count
- + tabs opened
- - tabs closed
- ~ tab switches

Click the extension button to download the per-day history since installation as CSV.

## Features to add

To track
- u unloaded tab count
- l loaded tab count
- w window count
- w+ windows opened
- w- windows closed
- w~ window switches
- median time on tab?

Other
- Option: Clear history
- Option: Never store data

## Needs fix

* Re-enable storage debounce
* Deterministically tell when session restore has ended, and start tracking tab events then

## Future UI directions

* Add popup that shows all stored data
* Rotate between values?
* Select visible badge?
* Tooltip with all values?

