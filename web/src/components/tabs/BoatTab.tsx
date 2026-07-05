import { FT_PER_M } from '../../config'
import { safetyDepthM } from '../../lib/depth'
import { activeBoat, addBoat, deleteBoat, setState, updateBoat, useApp } from '../../state/store'

export default function BoatTab(): JSX.Element {
  const s = useApp()
  const boat = activeBoat(s)

  const num = (label: string, key: 'draftFt' | 'safetyMarginFt' | 'cruiseKts' | 'fuelGph', step = 0.5) => (
    <label className="field">
      {label}
      <input
        type="number"
        min="0"
        step={step}
        value={boat[key]}
        onChange={(e) => updateBoat(boat.id, { [key]: Math.max(0, Number(e.target.value)) })}
      />
    </label>
  )

  const safetyFt = safetyDepthM(boat.draftFt, boat.safetyMarginFt) * FT_PER_M

  return (
    <div>
      <div className="field-row">
        <select value={boat.id} onChange={(e) => setState({ activeBoatId: e.target.value })}>
          {s.boats.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <button className="btn" onClick={addBoat}>+ Add boat</button>
        {s.boats.length > 1 && (
          <button className="btn danger" onClick={() => deleteBoat(boat.id)}>
            Delete
          </button>
        )}
      </div>
      <label className="field">
        Name
        <input value={boat.name} onChange={(e) => updateBoat(boat.id, { name: e.target.value })} />
      </label>
      {num('Draft (ft)', 'draftFt')}
      {num('Safety margin under keel (ft)', 'safetyMarginFt')}
      {num('Cruising speed (kts)', 'cruiseKts', 1)}
      {num('Fuel burn at cruise (gal/hr)', 'fuelGph', 0.5)}
      <p className="hint">
        Safety depth: <strong>{safetyFt.toFixed(1)} ft</strong> ({(safetyFt * 0.3048).toFixed(1)} m).
        Depth shading and autorouting treat water shallower than this as unsafe. Charted depths
        come from NOAA ENC and are referenced to chart datum (MLLW) — actual depth varies with
        tide.
      </p>
    </div>
  )
}
