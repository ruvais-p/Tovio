import { SpeakerOrder, railLayout } from "./layout";

describe("participant layout", () => {
  it("adapts to width, height and available sidebar space", () => {
    expect(railLayout(360, 640).slots).toBe(1);
    expect(railLayout(1440, 900).slots).toBeGreaterThan(
      railLayout(1440, 480).slots,
    );
    expect(railLayout(900, 700, 400).compact).toBe(true);
  });

  it("promotes sustained camera-off speakers and ignores brief noise", () => {
    const order = new SpeakerOrder();
    const people = [
      { identity: "camera", camera: true, local: false },
      { identity: "audio", camera: false, local: false },
    ];
    order.update(["audio"], 0);
    order.update(["camera"], 500);
    expect(order.top).toBeNull();
    order.update(["audio"], 600);
    order.update(["audio"], 1400);
    expect(order.sort(people)[0].identity).toBe("audio");
    order.update(["camera"], 1500);
    order.update(["camera"], 2400);
    expect(order.top).toBe("audio");
    order.update(["camera"], 3500);
    expect(order.top).toBe("camera");
  });

  it("keeps stable order and removes departed speakers", () => {
    const order = new SpeakerOrder();
    const people = ["b", "a", "c"].map((identity) => ({
      identity,
      camera: true,
      local: false,
    }));
    expect(order.sort(people).map((p) => p.identity)).toEqual(["b", "a", "c"]);
    expect(order.sort([...people].reverse()).map((p) => p.identity)).toEqual([
      "b",
      "a",
      "c",
    ]);
    order.update(["a"], 0);
    order.update(["a"], 800);
    order.sort(people.filter((p) => p.identity !== "a"));
    expect(order.top).toBeNull();
  });
});
