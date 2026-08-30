import { useState } from 'react'
import { ChevronRightIcon, CloseIcon } from '../../ui/Icons'
import { useModalFocus } from '../../ui/useModalFocus'
import type { NavigatorSelection, WorkspaceProbe } from './types'
import {
  buildNavigatorTree,
  isGroupSelected,
  isRegionSelected,
} from './workspaceModel'

export interface NavigatorPaneProps {
  isOpen: boolean
  probes: ReadonlyArray<WorkspaceProbe>
  selection: NavigatorSelection
  onClose: () => void
  onSelect: (selection: NavigatorSelection) => void
  modal?: boolean
}

export function NavigatorPane({
  isOpen,
  probes,
  selection,
  onClose,
  onSelect,
  modal = false,
}: NavigatorPaneProps) {
  const tree = buildNavigatorTree(probes)
  const [expanded, setExpanded] = useState<ReadonlySet<string> | null>(null)
  const expandedGroups = expanded ?? new Set(tree[0] ? [tree[0].key] : [])
  const [modalRef, onModalKeyDown] = useModalFocus<HTMLElement>(
    isOpen && modal,
    onClose,
  )

  const toggleGroup = (key: string) => {
    setExpanded((current) => {
      const next = new Set(current ?? expandedGroups)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  return (
    <aside
      aria-modal={modal || undefined}
      aria-label="探针导航"
      className={
        isOpen
          ? 'workspace-pane navigator-pane is-open'
          : 'workspace-pane navigator-pane'
      }
      id="probe-navigator"
      onKeyDown={onModalKeyDown}
      ref={modalRef}
      role={modal ? 'dialog' : undefined}
    >
      <header className="pane-heading">
        <h2>探针</h2>
        <button
          aria-label="关闭导航"
          className="pane-close"
          onClick={onClose}
          type="button"
        >
          <CloseIcon />
        </button>
      </header>

      <nav aria-label="探针分组" className="probe-tree">
        <button
          aria-current={selection.kind === 'all' ? 'page' : undefined}
          className={
            selection.kind === 'all'
              ? 'tree-row tree-row-all is-selected'
              : 'tree-row tree-row-all'
          }
          onClick={() => onSelect({ kind: 'all' })}
          type="button"
        >
          <ChevronRightIcon className="tree-chevron" />
          <span>全部探针</span>
          <span className="tree-count">{probes.length}</span>
        </button>

        {tree.map((group) => {
          const isExpanded = expandedGroups.has(group.key)
          const groupSelected = isGroupSelected(selection, group.value)

          return (
            <div className="tree-group" key={group.key}>
              <div
                className={
                  groupSelected
                    ? 'tree-row tree-region is-active'
                    : 'tree-row tree-region'
                }
              >
                <button
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? '收起' : '展开'}${group.label}`}
                  className="tree-expand"
                  onClick={() => toggleGroup(group.key)}
                  type="button"
                >
                  <ChevronRightIcon
                    className={
                      isExpanded ? 'tree-chevron is-expanded' : 'tree-chevron'
                    }
                  />
                </button>
                <button
                  aria-current={groupSelected ? 'page' : undefined}
                  className="tree-region-label"
                  onClick={() =>
                    onSelect({ kind: 'group', group: group.value })
                  }
                  type="button"
                >
                  <span>{group.label}</span>
                  <span className="tree-count">{group.count}</span>
                </button>
              </div>

              {isExpanded ? (
                <div className="tree-children">
                  {group.regions.map((region) => {
                    const regionSelected = isRegionSelected(
                      selection,
                      group.value,
                      region.value,
                    )
                    return (
                      <button
                        aria-current={regionSelected ? 'page' : undefined}
                        className={
                          regionSelected
                            ? 'tree-location bg-(--km-selected)! text-(--km-blue)!'
                            : 'tree-location bg-transparent'
                        }
                        key={region.key}
                        onClick={() =>
                          onSelect({
                            kind: 'region',
                            group: group.value,
                            region: region.value,
                          })
                        }
                        type="button"
                      >
                        <ChevronRightIcon className="tree-chevron" />
                        <span>{region.label}</span>
                        <span className="tree-count">{region.count}</span>
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
