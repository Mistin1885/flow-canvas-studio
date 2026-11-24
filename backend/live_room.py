"""Transient presence and coalesced revision notifications on existing sockets."""
import asyncio
from collections import defaultdict


class Peer:
    def __init__(self, label):
        self.label = label
        self.node = None
        self.revision = 0
        self.presence_changed = False
        self.ready = asyncio.Event()

    def take(self, room):
        self.ready.clear()
        message = {}
        if self.revision:
            message["rev"] = self.revision
            self.revision = 0
        if self.presence_changed:
            message["editing"] = self.node
            message["editors"] = sorted({p.label for p in room.editors.get(self.node, ()) if p is not self})
            self.presence_changed = False
        return message


class Room:
    def __init__(self):
        self.peers = set()
        self.editors = defaultdict(set)

    def move(self, peer, node):
        if node == peer.node:
            return
        changed = {peer}
        if peer.node is not None:
            previous = self.editors[peer.node]
            previous.discard(peer)
            changed.update(previous)
            if not previous:
                del self.editors[peer.node]
        peer.node = node
        if node is not None:
            self.editors[node].add(peer)
            changed.update(self.editors[node])
        for other in changed:
            other.presence_changed = True
            other.ready.set()
