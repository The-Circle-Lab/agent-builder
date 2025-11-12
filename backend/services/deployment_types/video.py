from __future__ import annotations

from typing import Any, Dict, List, Optional


class VideoDeployment:
    """Lightweight service wrapper for video-based deployments."""

    def __init__(self, deployment_id: str, nodes_config: Dict[str, Any]):
        self.deployment_id = deployment_id
        self._nodes = nodes_config or {}
        self._video_node = self._extract_video_node(self._nodes)
        self._config = (
            self._video_node.get("config", {})
            if isinstance(self._video_node, dict)
            else {}
        )

        videos = self._config.get("videos")
        self._videos: List[Dict[str, Any]] = (
            videos if isinstance(videos, list) else []
        )

        selected = self._config.get("selected_video_id")
        self._selected_video_id: Optional[str] = (
            str(selected) if selected is not None else None
        )

    @classmethod
    def from_config(
        cls, nodes_config: Dict[str, Any], deployment_id: str
    ) -> "VideoDeployment":
        return cls(deployment_id, nodes_config)

    @staticmethod
    def _extract_video_node(nodes_config: Dict[str, Any]) -> Dict[str, Any]:
        # Primary node is usually "1"; fall back to searching all nodes.
        primary = nodes_config.get("1")
        if isinstance(primary, dict) and primary.get("type") == "video":
            return primary

        for node in nodes_config.values():
            if isinstance(node, dict) and node.get("type") == "video":
                return node

        return {}

    def get_selected_video_id(self) -> Optional[str]:
        return self._selected_video_id

    def get_videos(self) -> List[Dict[str, Any]]:
        return self._videos

    def get_selected_video_entry(self) -> Optional[Dict[str, Any]]:
        target_id = self._selected_video_id
        if target_id is None:
            return None

        for entry in self._videos:
            if not isinstance(entry, dict):
                continue
            entry_id = entry.get("id")
            if entry_id is None:
                continue
            if str(entry_id) == target_id:
                return entry
        return None

    def build_config_metadata(self) -> Optional[Dict[str, Any]]:
        """Return best-effort metadata from stored workflow configuration."""
        entry = self.get_selected_video_entry()
        if not entry:
            return None

        metadata = dict(entry)
        video_id = metadata.get("id")
        if video_id is not None:
            video_id = str(video_id)
            metadata["id"] = video_id
            metadata.setdefault(
                "stream_url", f"/api/videos/{video_id}/stream"
            )
            metadata.setdefault(
                "download_url", f"/api/videos/{video_id}/download"
            )
        return metadata
