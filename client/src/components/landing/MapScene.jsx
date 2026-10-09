import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { clamp, ease, easeInOut, reducedMotion, seeded, span, watchScroll } from './motion'

// Scene 4: the emails from scene 3 are cut into passages and break into dots
// on a map of meaning. A question becomes a dot; its 6 nearest passages (the
// app also reads 6) light up; the answer cites its source. The 3D layout is
// illustrative: real embeddings have 1,024 dimensions.
const QUESTION = 'When is my OS assignment due?'
const NEAREST = 6
const CARDS = [
  { cluster: 'College', who: 'Prof. R. Mehta', what: 'Assignment 4: Operating Systems', due: 'Due Mon 12 Oct' },
  { cluster: 'Bank', who: 'Kestrel Bank', what: 'Your new debit card is on its way', due: 'Due Tue 20 Oct', ours: true },
  { cluster: 'Security', who: 'Northwind Accounts', what: 'New sign-in to your account', due: 'Today' },
  { cluster: 'Jobs', who: 'Acme Labs Recruiting', what: 'Interview on Google Meet', due: 'Fri 16 Oct, 3 PM' },
  { cluster: 'Promotions', lines: 9 },
]
const CLUSTERS = [
  { name: 'College', c: [-2.6, 0.9, 0.4], n: 46 },
  { name: 'Bank', c: [2.3, 1.4, -0.6], n: 38 },
  { name: 'Jobs', c: [0.4, -1.9, 1.2], n: 34 },
  { name: 'Security', c: [-1.2, -1.5, -2.0], n: 30 },
  { name: 'Promotions', c: [2.6, -1.0, 1.8], n: 60 },
]
// The question lands at the edge of the College cluster.
const Q_HOME = [-1.75, 0.55, 0.9]

const rand = seeded(7)
const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5
const POINTS = CLUSTERS.flatMap((cl) =>
  Array.from({ length: cl.n }, () => ({
    card: CARDS.findIndex((c) => c.cluster === cl.name),
    home: [cl.c[0] + gauss() * 0.9, cl.c[1] + gauss() * 0.7, cl.c[2] + gauss() * 0.8],
    u: rand(),
    v: rand(),
    delay: rand() * 0.5,
  })),
)
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const NEAREST_POINTS = POINTS.map((pt, i) => [dist(pt.home, Q_HOME), i])
  .sort((a, b) => a[0] - b[0])
  .slice(0, NEAREST)
  .map(([, i]) => i)

function MapScene() {
  const trackRef = useRef(null)
  const mapRef = useRef(null)
  const canvasRef = useRef(null)
  const askRef = useRef(null)
  const askTextRef = useRef(null)
  const answerRef = useRef(null)
  const legendRef = useRef(null)
  const qLabelRef = useRef(null)

  useEffect(() => {
    const [track, map, canvas, askBox, askText, answer, legend, qLabel] = [trackRef, mapRef, canvasRef, askRef, askTextRef, answerRef, legendRef, qLabelRef].map((r) => r.current)
    const narrow = window.matchMedia('(max-width: 860px)')
    const cards = [...map.querySelectorAll('.mc')].map((el, i) => ({ el, i, cuts: [...el.querySelectorAll('.cut2')], rect: null }))
    const labels = [...map.querySelectorAll('.map-label[data-cluster]')].map((el) => {
      const cl = CLUSTERS.find((c) => c.name === el.dataset.cluster)
      return { el, at: new THREE.Vector3(cl.c[0], cl.c[1] + 1.35, cl.c[2]) }
    })

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)

    // Round black dots.
    const dot = document.createElement('canvas')
    dot.width = dot.height = 64
    const g = dot.getContext('2d')
    g.fillStyle = '#000'
    g.beginPath()
    g.arc(32, 32, 28, 0, Math.PI * 2)
    g.fill()
    const sprite = new THREE.CanvasTexture(dot)
    const dots = (size, opacity = 1) =>
      new THREE.PointsMaterial({ size, map: sprite, transparent: true, alphaTest: 0.4, color: 0x000000, opacity })
    const buffer = (length) => {
      const array = new Float32Array(length)
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(array, 3))
      return [array, geometry]
    }

    const [pos, geo] = buffer(POINTS.length * 3)
    const cloudMat = dots(0.19, 0)
    scene.add(new THREE.Points(geo, cloudMat))
    const [nearPos, nearGeo] = buffer(NEAREST * 3)
    const nearMat = dots(0.36, 0)
    scene.add(new THREE.Points(nearGeo, nearMat))
    const [qPos, qGeo] = buffer(3)
    const qMat = dots(0.42, 0)
    scene.add(new THREE.Points(qGeo, qMat))
    const [linePos, lineGeo] = buffer(NEAREST * 6)
    const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0 })
    scene.add(new THREE.LineSegments(lineGeo, lineMat))

    const project = (v, el, opacity) => {
      const p = v.clone().project(camera)
      el.style.left = `${(p.x * 0.5 + 0.5) * map.clientWidth}px`
      el.style.top = `${(-p.y * 0.5 + 0.5) * map.clientHeight}px`
      el.style.opacity = opacity
    }

    const layout = () => {
      const mapRect = map.getBoundingClientRect()
      for (const c of cards) {
        c.el.style.transform = 'none'
        const r = c.el.getBoundingClientRect()
        c.rect = { x: r.left - mapRect.left, y: r.top - mapRect.top, w: r.width, h: r.height }
      }
      renderer.setSize(map.clientWidth, map.clientHeight, false)
      camera.aspect = map.clientWidth / Math.max(1, map.clientHeight)
      camera.updateProjectionMatrix()
    }

    const ray = new THREE.Vector3()
    const render = (p) => {
      const still = reducedMotion()
      const snap = (t) => (still ? (t > 0 ? 1 : 0) : t)

      // Camera: a slow turn while you scroll, closing in on the question.
      const turn = still ? 0.35 : -0.5 + p * 1.1
      const zoom = easeInOut(snap(span(p, 0.53, 0.76)))
      const radius = (narrow.matches ? 15 : 12.5) - 3.2 * zoom
      const target = new THREE.Vector3(Q_HOME[0] * zoom * 0.8, Q_HOME[1] * zoom * 0.8, Q_HOME[2] * zoom * 0.8)
      camera.position.set(target.x + Math.sin(turn) * radius, target.y + 2.2, target.z + Math.cos(turn) * radius)
      camera.lookAt(target)
      camera.updateMatrixWorld() // labels follow this frame's camera, not the last one

      // 1. The emails come down (0%–8%), are cut into passages (8%–12%),
      // and break into dots that fly to their clusters (12%–32%).
      for (const c of cards) {
        const fall = still ? (p > 0 ? 1 : 0) : ease(span(p, c.i * 0.012, 0.06 + c.i * 0.012))
        const gone = span(p, 0.12 + c.i * 0.01, 0.17 + c.i * 0.01)
        c.el.style.transform = `translateY(${-(c.rect ? c.rect.y + c.rect.h + 120 : 400) * (1 - fall)}px)`
        c.el.style.opacity = Math.min(fall, 1 - gone)
        c.cuts.forEach((cut, j) => {
          cut.style.transform = `scaleX(${ease(span(p, 0.08 + j * 0.015, 0.11 + j * 0.015))})`
        })
      }
      const depth = camera.position.distanceTo(target) * 0.82
      POINTS.forEach((pt, i) => {
        const t = easeInOut(snap(span(p, 0.12 + pt.delay * 0.1, 0.24 + pt.delay * 0.1)))
        const r = cards[pt.card].rect
        let from = pt.home
        if (r) {
          // Where this passage sits on its card, on screen, lifted into 3D.
          const sx = r.x + pt.u * r.w
          const sy = r.y + pt.v * r.h
          ray.set((sx / map.clientWidth) * 2 - 1, -(sy / map.clientHeight) * 2 + 1, 0.5).unproject(camera).sub(camera.position).normalize()
          from = [camera.position.x + ray.x * depth, camera.position.y + ray.y * depth, camera.position.z + ray.z * depth]
        }
        for (let k = 0; k < 3; k++) pos[i * 3 + k] = from[k] + (pt.home[k] - from[k]) * t
      })
      geo.attributes.position.needsUpdate = true
      cloudMat.opacity = span(p, 0.12, 0.14)
      const showLabels = span(p, 0.28, 0.33) * (1 - 0.6 * span(p, 0.64, 0.72))
      labels.forEach((l) => project(l.at, l.el, showLabels))

      // 2. The question is typed, then drops onto the map.
      askBox.style.opacity = span(p, 0.32, 0.36)
      const typed = still ? (p > 0.34 ? QUESTION.length : 0) : Math.round(QUESTION.length * span(p, 0.34, 0.45))
      askText.textContent = QUESTION.slice(0, typed)
      const drop = ease(snap(span(p, 0.46, 0.53)))
      qPos.set([Q_HOME[0], Q_HOME[1] + 3.5 * (1 - drop), Q_HOME[2]])
      qGeo.attributes.position.needsUpdate = true
      qMat.opacity = drop
      project(new THREE.Vector3(qPos[0], qPos[1] + 0.55, qPos[2]), qLabel, drop)

      // 3. Its nearest passages light up and connect.
      const link = snap(span(p, 0.55, 0.66))
      NEAREST_POINTS.forEach((idx, j) => {
        const h = POINTS[idx].home
        nearPos.set(h, j * 3)
        const reach = clamp(link * 1.4 - j * 0.07)
        linePos.set(
          [qPos[0], qPos[1], qPos[2], qPos[0] + (h[0] - qPos[0]) * reach, qPos[1] + (h[1] - qPos[1]) * reach, qPos[2] + (h[2] - qPos[2]) * reach],
          j * 6,
        )
      })
      nearGeo.attributes.position.needsUpdate = true
      lineGeo.attributes.position.needsUpdate = true
      nearMat.opacity = link
      lineMat.opacity = link
      legend.style.opacity = span(p, 0.58, 0.66)

      // 4. The answer, with its source.
      const a = ease(snap(span(p, 0.72, 0.82)))
      answer.style.opacity = a
      answer.style.transform = `translateY(${10 * (1 - a)}px)`

      renderer.render(scene, camera)
    }

    const stop = watchScroll(track, render, layout)
    return () => {
      stop()
      ;[geo, nearGeo, qGeo, lineGeo, cloudMat, nearMat, qMat, lineMat, sprite].forEach((x) => x.dispose())
      renderer.dispose()
    }
  }, [])

  return (
    <div className="track4" ref={trackRef}>
      <div className="stage4">
        <div className="map-copy">
          <h2>Ask your inbox. Answers come with sources.</h2>
          <p>
            Every email is split into passages, already redacted, and placed on a map of meaning: similar passages
            sit close together. Your question goes on the map too, and Mailmind reads the closest passages, found by
            meaning and by words.
          </p>
          <div className="ask" ref={askRef}>
            <span ref={askTextRef} />
            <span className="caret" />
          </div>
          <div className="answer" ref={answerRef}>
            <p>Assignment 4 for Operating Systems is due Monday 12 October.</p>
            <div className="source">
              <span>Source:</span>
              <b>Prof. R. Mehta, Assignment 4: Operating Systems</b>
              <span>Open in Gmail</span>
            </div>
          </div>
        </div>
        <div className="map" ref={mapRef}>
          <canvas ref={canvasRef} aria-label="Passages from your emails as points, grouped by meaning" />
          <div className="map-cards">
            {CARDS.map((c) => (
              <article className={`mc${c.ours ? ' ours' : ''}${c.lines ? ' lines' : ''}`} key={c.cluster}>
                {c.lines ? (
                  Array.from({ length: c.lines }, (_, i) => <i key={i} />)
                ) : (
                  <>
                    <div className="who">{c.who}</div>
                    <div className="what">{c.what}</div>
                    <span className="due">{c.due}</span>
                  </>
                )}
                <span className="cut2" style={{ top: '36%' }} />
                <span className="cut2" style={{ top: '68%' }} />
              </article>
            ))}
          </div>
          {CLUSTERS.map((cl) => (
            <div className="map-label" data-cluster={cl.name} key={cl.name}>
              {cl.name}
            </div>
          ))}
          <div className="map-label q" ref={qLabelRef}>
            Your question
          </div>
          <p className="map-legend" ref={legendRef}>
            Each point is a passage from an email. Lines join your question to the 6 passages Mailmind reads.
          </p>
        </div>
      </div>
    </div>
  )
}

export default MapScene
