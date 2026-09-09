import type { PageSize } from "../bookPresentation.ts";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { BackSide, FrontSide, MeshBasicMaterial, PlaneGeometry, BufferGeometry, Float32BufferAttribute, LineBasicMaterial, type BufferAttribute, type WebGLProgramParametersWithUniforms } from "three";
import type { SceneSheets } from "./BookScene.tsx";
import { stackLeafProgress } from "./pageStackMotion.ts";
import { advancePageMotion, type PageMotion } from "./pageMotion.ts";

const COLUMNS = 64, ROWS = 12;
function shadePaper(shader: WebGLProgramParametersWithUniforms) {
  shader.vertexShader = `varying vec3 paperNormal;\n${shader.vertexShader}`.replace(
    "#include <begin_vertex>", "#include <begin_vertex>\npaperNormal = normalize(normalMatrix * normal);",
  );
  shader.fragmentShader = `varying vec3 paperNormal;\n${shader.fragmentShader}`.replace(
    "#include <opaque_fragment>", `
      vec3 n = normalize(paperNormal);
      float facing = abs(n.z);
      float sheen = pow(max(0., abs(n.x) * .85 + facing * .3), 12.) * (1. - facing);
      outgoingLight *= .86 + .14 * facing;
      outgoingLight += vec3(.13, .105, .075) * sheen;
      #include <opaque_fragment>`,
  );
}

export default function TurningSheet({ sheets, motion, opening, size, onSettled, lowQuality, sheetCount = 1, dark }: {
  sheets: SceneSheets; motion: MutableRefObject<PageMotion>; opening: boolean; size: PageSize; sheetCount?: number; dark: boolean;
  onSettled: (committed: boolean) => void; lowQuality: () => void;
}) {
  const invalidate = useThree(state => state.invalidate);
  const columns = sheetCount > 1 ? 40 : COLUMNS, rows = sheetCount > 1 ? 8 : ROWS;
  const layers = useMemo(() => Array.from({ length: sheetCount }, () => {
    const front = new PlaneGeometry(size.width, size.height, columns, rows).translate(size.width / 2, 0, 0);
    const back = front.clone(), uv = back.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    const edge = new BufferGeometry();
    edge.setAttribute("position", new Float32BufferAttribute(new Float32Array((columns * 2 + rows) * 6), 3));
    return { front, back, edge };
  }), [sheetCount, size.width, size.height, columns, rows]);
  const firstFrame = useRef(true), slowFrames = useRef(0);
  const materials = useMemo(() => {
    const front = new MeshBasicMaterial({ map: sheets.front, side: FrontSide, toneMapped: false });
    const back = new MeshBasicMaterial({ map: sheets.back, side: BackSide, toneMapped: false });
    front.onBeforeCompile = shadePaper; back.onBeforeCompile = shadePaper;
    const edge = new LineBasicMaterial({ color: dark ? "#989185" : "#ab9f8b", transparent: true, opacity: .65, toneMapped: false });
    return { front, back, edge };
  }, [sheets, dark]);
  useEffect(() => () => Object.values(materials).forEach(material => material.dispose()), [materials]);
  useEffect(() => () => layers.forEach(layer => { layer.front.dispose(); layer.back.dispose(); layer.edge.dispose(); }), [layers]);
  useEffect(() => { invalidate(); }, [sheets, invalidate]);
  useFrame((_, elapsed) => {
    const state = motion.current;
    if (state.finished && !firstFrame.current) return;
    const delta = firstFrame.current ? 1 / 60 : elapsed;
    if (!state.finished) firstFrame.current = false;
    if (delta > 0.05 && ++slowFrames.current % 24 === 0) lowQuality();
    const animating = !state.finished;
    if (animating) advancePageMotion(state, delta);
    const progress = Math.max(0, Math.min(1, state.progress));
    const base = state.direction > 0 ? progress : 1 - progress;
    layers.forEach((layer, index) => {
      const fraction = sheetCount > 1 ? index / (sheetCount - 1) : 0;
      const p = stackLeafProgress(base, index, sheetCount), envelope = Math.sin(p * Math.PI);
      // The top of the stack becomes its bottom as the packet turns over.
      // Fan offsets vanish together; no leaf has its own delayed start or commit.
      const thickness = sheetCount > 1 ? ((1 - base) * index + base * (sheetCount - 1 - index)) * .65 : 0;
      const positions = layer.front.getAttribute("position");
      for (let row = 0; row <= rows; row++) {
        const v = row / rows; let x = 0, z = 0;
        for (let col = 0; col <= columns; col++) {
          const u = col / columns;
          if (col) {
            const curl = envelope * (opening ? .035 : sheetCount > 1 ? .30 + fraction * .08 : .64) * Math.sin(u * Math.PI * 1.2);
            const twist = opening ? 0 : envelope * (sheetCount > 1 ? .35 : state.grabY) * (v - .5) * .32 * u;
            const angle = p * Math.PI + curl + twist;
            x += Math.cos(angle) * size.width / columns; z += Math.sin(angle) * size.width / columns;
          }
          const lift = opening ? 0 : envelope * Math.sin(v * Math.PI) * Math.sin(u * Math.PI) * (sheetCount > 1 ? 7 : 14);
          positions.setXYZ(row * (columns + 1) + col, x, size.height / 2 - v * size.height, z + lift + thickness + .1);
        }
      }
      positions.needsUpdate = true; layer.front.computeVertexNormals();
      (layer.back.getAttribute("position") as BufferAttribute).copy(positions as BufferAttribute); layer.back.getAttribute("position").needsUpdate = true;
      (layer.back.getAttribute("normal") as BufferAttribute).copy(layer.front.getAttribute("normal") as BufferAttribute); layer.back.getAttribute("normal").needsUpdate = true;
      if (sheetCount > 1) {
        const edge = layer.edge.getAttribute("position"); let point = 0;
        const segment = (a: number, b: number) => {
          for (const vertex of [a, b]) edge.setXYZ(point++, positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex) + .2);
        };
        for (let col = 0; col < columns; col++) { segment(col, col + 1); segment(rows * (columns + 1) + col, rows * (columns + 1) + col + 1); }
        for (let row = 0; row < rows; row++) segment(row * (columns + 1) + columns, (row + 1) * (columns + 1) + columns);
        edge.needsUpdate = true;
      }
    });
    if (animating && state.finished) onSettled(state.target === 1);
    else if (animating) invalidate();
  });
  return <group name="reader-turning-stack">
    {layers.map((layer, index) => <group key={index}>
      <mesh geometry={layer.front} material={materials.front} castShadow dispose={null} frustumCulled={false} />
      <mesh geometry={layer.back} material={materials.back} dispose={null} frustumCulled={false} />
      {sheetCount > 1 && <lineSegments geometry={layer.edge} material={materials.edge} dispose={null} frustumCulled={false} />}
    </group>)}
  </group>;
}
