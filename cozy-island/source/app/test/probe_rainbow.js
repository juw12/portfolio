async () => {
  const world = Cozy.debug.world;
  const fx = world.rainbowFx;
  const bow = fx.bows[0];
  const projected = bow.position.clone().add(fx.group.position).project(world.camera);
  return {
    rainbow: world.rainbow,
    amount: fx.amount,
    timer: fx.timer,
    groupVisible: fx.group.visible,
    rain: world.rain,
    night: world.night,
    opacity: bow.material.uniforms.opacity.value,
    bowLocal: bow.position.toArray().map((v) => Math.round(v)),
    camera: world.camera.position.toArray().map((v) => Math.round(v * 10) / 10),
    antisolarOnScreen: projected.toArray().map((v) => Math.round(v * 100) / 100),
    sunY: world.sky.material.uniforms.sunDirection.value.y,
  };
}
