import { Link, useSearchParams } from 'react-router-dom'
import { ChevronRightIcon, CloseIcon } from '../../ui/Icons'
import { useModalFocus } from '../../ui/useModalFocus'
import { workspaceStatus } from './statusPresentation'
import type { WorkspaceProbe } from './types'

export interface InspectorPaneProps {
  isOpen: boolean
  probe: WorkspaceProbe | null
  onClose: () => void
  modal?: boolean
}

function KeyValueRow({
  label,
  value,
}: {
  label: string
  value: string | number
}) {
  return (
    <div className="key-value-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

export function InspectorPane({
  isOpen,
  probe,
  onClose,
  modal = false,
}: InspectorPaneProps) {
  const [modalRef, onModalKeyDown] = useModalFocus<HTMLElement>(
    isOpen && modal,
    onClose,
  )
  const [searchParams] = useSearchParams()
  const modalProps = {
    'aria-modal': modal || undefined,
    onKeyDown: onModalKeyDown,
    ref: modalRef,
    role: modal ? ('dialog' as const) : undefined,
  }

  if (!probe) {
    return (
      <aside
        aria-label="探针检查器"
        className={
          isOpen
            ? 'workspace-pane inspector-pane is-open'
            : 'workspace-pane inspector-pane'
        }
        id="probe-inspector"
        {...modalProps}
      >
        <header className="inspector-heading">
          <div>
            <h2>检查器</h2>
            <p>暂无探针</p>
          </div>
          <button
            aria-label="关闭检查器"
            className="pane-close"
            onClick={onClose}
            type="button"
          >
            <CloseIcon />
          </button>
        </header>
      </aside>
    )
  }

  const state = workspaceStatus(probe)
  const historySearch = new URLSearchParams(searchParams)
  historySearch.set('view', 'history')
  if (!historySearch.has('range')) historySearch.set('range', '6h')

  return (
    <aside
      aria-label="探针检查器"
      className={
        isOpen
          ? 'workspace-pane inspector-pane is-open'
          : 'workspace-pane inspector-pane'
      }
      id="probe-inspector"
      {...modalProps}
    >
      <header className="inspector-heading">
        <div>
          <h2>{probe.name}</h2>
          <p>
            <span
              aria-hidden="true"
              className={`status-dot inspector-status status-${state.tone}`}
            />
            {state.detail}
          </p>
        </div>
        <button
          aria-label="关闭检查器"
          className="pane-close"
          onClick={onClose}
          type="button"
        >
          <CloseIcon />
        </button>
      </header>

      <div className="inspector-content">
        <section className="inspector-section">
          <h3>系统</h3>
          <dl>
            <KeyValueRow
              label="操作系统"
              value={probe.operatingSystem ?? '—'}
            />
            <KeyValueRow label="架构" value={probe.architecture ?? '—'} />
            <KeyValueRow
              label="CPU"
              value={probe.cpuCores === null ? '—' : `${probe.cpuCores} 核`}
            />
            <KeyValueRow label="内存" value={probe.memoryTotal ?? '—'} />
            <KeyValueRow label="磁盘" value={probe.diskTotal ?? '—'} />
          </dl>
        </section>

        <section className="inspector-section">
          <h3>网络</h3>
          <dl>
            <KeyValueRow label="累计上行" value={probe.uploadTotal ?? '—'} />
            <KeyValueRow label="累计下行" value={probe.downloadTotal ?? '—'} />
          </dl>
        </section>

        <section className="inspector-section">
          <h3>运行</h3>
          <dl>
            <KeyValueRow label="已运行" value={probe.uptime ?? '—'} />
          </dl>
        </section>

        <Link
          className="inspector-detail"
          to={{
            pathname: `/instance/${probe.id}`,
            search: historySearch.toString(),
          }}
        >
          <span>详情</span>
          <ChevronRightIcon />
        </Link>
      </div>
    </aside>
  )
}
