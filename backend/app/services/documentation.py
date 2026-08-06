"""Track whether a machine's generated Obsidian document is current."""

from app.models import Machine


def mark_obsidian_document_outdated(machine: Machine) -> None:
    machine.obsidian_document_needs_regeneration = True


def mark_obsidian_document_current(machine: Machine) -> None:
    machine.obsidian_document_needs_regeneration = False
