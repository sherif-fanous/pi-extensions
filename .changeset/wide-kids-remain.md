---
"@sherif-fanous/pi-rtk": patch
---

- Fixed: Warn when the rtk binary becomes unreachable again after `/new`,
  `/resume`, or `/fork` found it working, instead of staying silent because RTK
  had already warned about the earlier outage
