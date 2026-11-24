// @vitest-environment jsdom
import { StrictMode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { fakeWebR } from "../testing/fake-webr.js";
import { mount, settle } from "../testing/mount.js";
import { WebRProvider, useWebR } from "./provider.js";
import type { WebRState } from "./provider.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function watch() {
  const states: WebRState[] = [];
  const Watcher = () => {
    states.push(useWebR());
    return null;
  };
  return { states, watcher: <Watcher /> };
}

test("initialises, installs and attaches before it is ready", async () => {
  const fake = fakeWebR();
  const { states, watcher } = watch();
  mount(
    <WebRProvider webR={fake.webR} packages={["ggplot2", "my pkg"]}>
      {watcher}
    </WebRProvider>,
  );
  expect(states.at(-1)).toEqual({ webR: fake.webR, status: "loading" });

  await settle();
  expect(states.at(-1)?.status).toBe("ready");
  expect(fake.installPackages).toHaveBeenCalledWith(["ggplot2", "my pkg"]);
  expect(fake.evalRVoid).toHaveBeenCalledWith(
    "library(ggplot2)\nlibrary(`my pkg`)",
  );
  const [init = 0, install = 0, attach = 0] = [
    fake.init,
    fake.installPackages,
    fake.evalRVoid,
  ].map((call) => call.mock.invocationCallOrder[0]);
  expect(init).toBeLessThan(install);
  expect(install).toBeLessThan(attach);
});

test("does not call installPackages without packages", async () => {
  const fake = fakeWebR();
  const { states, watcher } = watch();
  mount(<WebRProvider webR={fake.webR}>{watcher}</WebRProvider>);
  await settle();
  expect(states.at(-1)?.status).toBe("ready");
  expect(fake.init).toHaveBeenCalledTimes(1);
  expect(fake.installPackages).not.toHaveBeenCalled();
  expect(fake.evalRVoid).not.toHaveBeenCalled();
});

test("prepares the same instance and packages only once", async () => {
  const fake = fakeWebR();
  const tree = (
    <StrictMode>
      <WebRProvider webR={fake.webR} packages={["ggplot2"]} />
    </StrictMode>
  );
  const first = mount(tree);
  await settle();
  first.unmount();
  const { states, watcher } = watch();
  mount(
    <WebRProvider webR={fake.webR} packages={["ggplot2"]}>
      {watcher}
    </WebRProvider>,
  );
  await settle();
  expect(states.at(-1)?.status).toBe("ready");
  expect(fake.init).toHaveBeenCalledTimes(1);
  expect(fake.installPackages).toHaveBeenCalledTimes(1);
});

test("installs again for another list of packages", async () => {
  const fake = fakeWebR();
  const { states, watcher } = watch();
  const tree = (packages: string[]) => (
    <WebRProvider webR={fake.webR} packages={packages}>
      {watcher}
    </WebRProvider>
  );
  const { render } = mount(tree(["ggplot2"]));
  await settle();
  render(tree(["ggplot2", "dplyr"]));
  expect(states.at(-1)?.status).toBe("loading");
  await settle();
  expect(states.at(-1)?.status).toBe("ready");
  expect(fake.installPackages).toHaveBeenLastCalledWith(["ggplot2", "dplyr"]);
});

test("reports a failure as the status error", async () => {
  const fake = fakeWebR();
  const failure = new Error("there is no package called 'nope'");
  fake.evalRVoid.mockRejectedValue(failure);
  const { states, watcher } = watch();
  mount(
    <WebRProvider webR={fake.webR} packages={["nope"]}>
      {watcher}
    </WebRProvider>,
  );
  await settle();
  expect(states.at(-1)).toEqual({
    webR: fake.webR,
    status: "error",
    error: failure,
  });
});

test("useWebR needs a provider", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { watcher } = watch();
  expect(() => mount(watcher)).toThrow("<WebRProvider>");
});
