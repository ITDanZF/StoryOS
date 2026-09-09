import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from "react";
import { PerspectiveCamera, type Group, type Texture } from "three";
import TurningSheet from "./TurningSheet.tsx";
import type { PageMotion } from "./pageMotion.ts";
import type { PageSize } from "../bookPresentation.ts";
export type { PageMotion } from "./pageMotion.ts";
export type SceneSheets = { left: Texture; right: Texture; front: Texture; back: Texture };
export type RestingSheets = { left: Texture; right: Texture };
const sceneEvents = () => ({ enabled: false, priority: 0 });
type Props = {
  size: PageSize; scale: number; double: boolean; opening: boolean; cover: boolean; dark: boolean;
  resting: RestingSheets | null; sheets: SceneSheets | null; revision: number; effects: boolean;
  motion: MutableRefObject<PageMotion>; onSettled: (committed: boolean) => void;
  onReady: (revision: number) => Promise<void>; onFailure: () => void; onSlow: () => void; dpr: number;
};
function SceneReady({ revision, onReady, onFailure, textures }: { revision: number; onReady: Props["onReady"]; onFailure: () => void; textures: Texture[] }): null {
  const { gl, scene, camera, invalidate } = useThree();
  const ready = useRef(false), frames = useRef(0);
  useEffect(() => {
    let alive = true; ready.current = false; frames.current = 0;
    const lost = (event: Event) => { event.preventDefault(); onFailure(); };
    const element = gl.domElement;
    element.addEventListener("webglcontextlost", lost);
    void (async () => {
      for (const texture of new Set(textures)) { texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy()); gl.initTexture(texture); }
      await gl.compileAsync(scene, camera);
      if (alive) { ready.current = true; invalidate(); }
    })().catch(() => { if (alive) onFailure(); });
    return () => { alive = false; element.removeEventListener("webglcontextlost", lost); };
  }, [gl, scene, camera, invalidate, revision, onFailure]);
  useFrame(() => {
    if (!ready.current) return;
    if (++frames.current === 2) { ready.current = false; void onReady(revision).then(() => invalidate()).catch(onFailure); }
    else invalidate();
  });
  return null;
}
function CameraCalibration({ distance }: { distance: number }): null {
  const { camera, size, invalidate } = useThree();
  useLayoutEffect(() => {
    if (camera instanceof PerspectiveCamera) { camera.position.z = distance; camera.near = 100; camera.far = distance + 3000; camera.fov = 2 * Math.atan(size.height / (distance * 2)) * 180 / Math.PI; camera.updateProjectionMatrix(); invalidate(); }
  }, [camera, size.height, distance, invalidate]);
  return null;
}
function BookBody(props: Props) {
  const { size, scale, double, cover, opening, resting, sheets, motion, effects } = props;
  const group = useRef<Group>(null), half = size.width / 2;
  const expanded = double && (!cover || opening), width = expanded ? size.width * 2 : size.width;
  const center = expanded ? 0 : half;
  useFrame(() => {
    if (group.current) group.current.position.x = opening && double ? -half * scale * (1 - Math.max(0, Math.min(1, motion.current.progress))) : expanded ? 0 : -half * scale;
  });
  const surfaces = sheets ?? resting;
  return <group ref={group} scale={scale} position={[expanded ? 0 : -half * scale, 0, 0]}>
    <mesh position={[center, -2, -6]}><boxGeometry args={[width + 6, size.height + 6, 6]} /><meshStandardMaterial color="#252b35" roughness={.8} /></mesh>
    <mesh position={[center, -2, -2]}><boxGeometry args={[width, size.height, 3]} /><meshStandardMaterial color={props.dark ? "#41454e" : "#d5cbbb"} /></mesh>
    {surfaces && <>
      {expanded && !opening && <mesh position={[-half, 0, 0]}><planeGeometry args={[size.width, size.height]} /><meshBasicMaterial map={surfaces.left} toneMapped={false} /></mesh>}
      <mesh position={[half, 0, 0]}><planeGeometry args={[size.width, size.height]} /><meshBasicMaterial map={surfaces.right} toneMapped={false} /></mesh>
      {effects && sheets && <mesh position={[center, 0, .01]} receiveShadow><planeGeometry args={[width, size.height]} /><shadowMaterial transparent opacity={.13} depthWrite={false} /></mesh>}
      {sheets && <TurningSheet sheets={sheets} motion={motion} opening={opening} size={size} sheetCount={motion.current.sheetCount ?? 1} dark={props.dark} onSettled={props.onSettled} lowQuality={props.onSlow} />}
    </>}
  </group>;
}
export default function BookScene(props: Props) {
  const textures = props.sheets ? Object.values(props.sheets) : props.resting ? Object.values(props.resting) : [];
  const distance = Math.max(4800, (props.size.width * props.scale + 16) * (props.size.height * props.scale + 56) / 40);
  return <Canvas camera={{ position: [0, 0, distance], near: 100, far: distance + 3000 }} frameloop="demand" events={sceneEvents}
    shadows={props.effects ? "soft" : false} dpr={props.dpr} gl={{ antialias: true, alpha: true }}
    aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
    <CameraCalibration distance={distance} />
    <ambientLight intensity={1.8} />
    <directionalLight position={[-300, 550, 1000]} intensity={2} color="#fff1d8" castShadow={props.effects}
      shadow-mapSize={[1024, 1024]} shadow-camera-left={-1000} shadow-camera-right={1000} shadow-camera-top={900} shadow-camera-bottom={-900}
      shadow-camera-near={1} shadow-camera-far={2600} shadow-bias={-.0005} />
    <BookBody {...props} />
    {textures.length > 0 && <SceneReady revision={props.revision} onReady={props.onReady} onFailure={props.onFailure} textures={textures} />}
  </Canvas>;
}


