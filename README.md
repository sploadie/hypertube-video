**This repository is for a 42 Project, and will not be maintained upon completion.**

HYPERTUBE
=========

```
GET  /                                  | Homepage
POST /add_torrent                       | Form action to download torrent
GET  /videos/*                          | Call for video stream
GET  /adapter/:adapter_name/:video_path | Adapter (for iframe)
GET  /player/:adapter_name/:video_path  | Video Player (calls adapter in iframe)
```