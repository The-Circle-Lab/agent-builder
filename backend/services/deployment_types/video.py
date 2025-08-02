class VideoDeployment:
    _title: str
    _video_url: str

    def __init__(self, title: str, video_url: str):
        self._title = title
        self._video_url = video_url

        if not title:
            raise ValueError(f"No Title")
        if not video_url:
            raise ValueError(f"No Video Url")

    def get_title(self) -> str:
        """Get the title"""
        return self._title

    def get_video_url(self) -> str:
        """Get the video url"""
        return self._video_url
