import { MetricGauge, TrafficGauge } from './ProbeMeters'
import { workspaceStatus } from './statusPresentation'
import type { WorkspaceProbe } from './types'

function Fact({
  label,
  value,
}: {
  label: string
  value: string | number | null | undefined
}) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

export function ProbeInfo({ probe }: { probe: WorkspaceProbe }) {
  const status = workspaceStatus(probe)
  const current = probe.connection === 'online' && probe.freshness === 'fresh'
  return (
    <section
      className="probe-info"
      aria-label="探针信息"
      data-tone={status.tone}
    >
      <header className="probe-info-heading">
        <h3>
          {current
            ? '当前状态'
            : probe.freshness === 'missing'
              ? '状态'
              : '最后上报'}
        </h3>
        <span>
          <i
            className={'status-dot status-' + status.tone}
            aria-hidden="true"
          />
          {status.detail}
        </span>
      </header>
      <div className="probe-info-metrics">
        <MetricGauge label="CPU" tone="cpu" value={probe.cpu} />
        <MetricGauge label="内存" tone="memory" value={probe.memory} />
        <MetricGauge label="磁盘" tone="disk" value={probe.disk} />
        <MetricGauge
          label="Ping"
          tone="ping"
          suffix="ms"
          value={probe.ping}
          detail={probe.pingLabel ?? undefined}
        />
      </div>
      <div className="probe-info-grid">
        <section>
          <h3>配置</h3>
          <dl>
            <Fact label="地区" value={probe.region} />
            <Fact label="分组" value={probe.group} />
            <Fact label="系统" value={probe.operatingSystem} />
            <Fact label="架构" value={probe.architecture} />
            <Fact
              label="处理器"
              value={probe.cpuCores ? probe.cpuCores + ' 核' : null}
            />
            <Fact label="内存" value={probe.memoryTotal} />
            <Fact label="磁盘" value={probe.diskTotal} />
            <Fact label="运行" value={probe.uptime} />
          </dl>
        </section>
        <section>
          <h3>网络</h3>
          <dl>
            <Fact label="上行速率" value={probe.network.uploadRate} />
            <Fact label="下行速率" value={probe.network.downloadRate} />
            <Fact label="累计上行" value={probe.network.uploadTotal} />
            <Fact label="累计下行" value={probe.network.downloadTotal} />
            <Fact label="流量统计" value={probe.traffic.basis} />
            <Fact label="重置周期" value={probe.traffic.resetLabel} />
          </dl>
          {probe.traffic.limit ? (
            <TrafficGauge traffic={probe.traffic} />
          ) : (
            <p className="probe-info-muted">未设流量限额</p>
          )}
        </section>
        <section>
          <h3>账单</h3>
          {probe.billing ? (
            <dl>
              <Fact label="费用" value={probe.billing.price} />
              <Fact label="到期" value={probe.billing.expiresOn} />
              <Fact label="剩余" value={probe.billing.remaining} />
              <Fact
                label="续费"
                value={probe.billing.autoRenewal ? '自动续费' : null}
              />
            </dl>
          ) : (
            <p className="probe-info-muted">未设置</p>
          )}
          {probe.publicRemark || probe.tags.length ? (
            <div className="probe-info-notes">
              {probe.publicRemark ? <p>{probe.publicRemark}</p> : null}
              {probe.tags.length ? (
                <div className="probe-card-tags">
                  {probe.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </section>
  )
}
