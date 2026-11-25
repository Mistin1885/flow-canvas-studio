import { useEffect, useState } from 'react'
import { api, errorText } from '../api'
export function CopyOptions({
  target,
  source,
  follow,
  change,
}: {
  target: string
  source: string
  follow: boolean
  change: (v: boolean) => void
}) {
  const [info, setInfo] = useState<{ total: number; eligible: number }>(),
    [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setInfo(undefined)
    setError('')
    api<{ total: number; eligible: number }>(
      'knowledge/' + target + '/copy-preview?source=' + encodeURIComponent(source),
    )
      .then((v) => {
        if (active) setInfo(v)
      })
      .catch((e) => {
        if (active) setError(errorText(e))
      })
    return () => {
      active = false
    }
  }, [target, source])
  if (error) return <small role="alert">{error}</small>
  if (!info?.total) return null
  return (
    <label>
      一併帶入的知識條目
      <select value={follow ? 'follow' : 'copy'} onChange={(e) => change(e.target.value === 'follow')}>
        <option value="copy">全部建立獨立副本</option>
        <option value="follow" disabled={!info.eligible}>
          已共用的條目繼續跟隨原文
        </option>
      </select>
      <small>
        {follow ? info.eligible : 0} 篇跟隨原文 · {info.total - (follow ? info.eligible : 0)} 篇獨立副本
      </small>
    </label>
  )
}
