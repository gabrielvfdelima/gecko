import {
    applyGeckoThemeColor,
    DEFAULT_GECKO_BRAND_COLOR,
    GeckoDerivedPalette,
    hexToRgb,
    hsvToRgb,
    normalizeHex,
    RGB,
    rgbToHex,
    rgbToHsv,
} from "./colorEngine";

export const GECKO_DYNAMIC_LOGO_SVG = `<svg class="brand-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1254 1254" width="25" height="25" aria-hidden="true" focusable="false">
  <g class="gecko-svg-primary" fill="var(--brand-color, #4CF00C)">
    <path d="M 1162.00,497.00 C 1157.50,489.83 1150.17,479.83 1143.00,473.00 C 1135.83,466.17 1128.50,461.33 1119.00,456.00 C 1109.50,450.67 1111.17,451.00 1086.00,441.00 C 1060.83,431.00 998.33,408.67 968.00,396.00 C 937.67,383.33 922.33,375.50 904.00,365.00 C 885.67,354.50 872.17,344.50 858.00,333.00 C 843.83,321.50 829.00,304.83 819.00,296.00 C 809.00,287.17 806.50,285.50 798.00,280.00 C 789.50,274.50 777.50,267.67 768.00,263.00 C 758.50,258.33 751.33,255.50 741.00,252.00 C 730.67,248.50 717.67,244.67 706.00,242.00 C 694.33,239.33 688.67,237.33 671.00,236.00 C 653.33,234.67 622.17,232.67 600.00,234.00 C 577.83,235.33 557.50,238.83 538.00,244.00 C 518.50,249.17 497.17,258.67 483.00,265.00 C 468.83,271.33 463.17,275.33 453.00,282.00 C 442.83,288.67 434.33,294.67 422.00,305.00 C 409.67,315.33 396.67,326.83 379.00,344.00 C 361.33,361.17 336.33,385.33 316.00,408.00 C 295.67,430.67 270.50,462.33 257.00,480.00 C 243.50,497.67 241.83,502.33 235.00,514.00 C 228.17,525.67 221.17,538.83 216.00,550.00 C 210.83,561.17 207.33,570.33 204.00,581.00 C 200.67,591.67 197.67,600.17 196.00,614.00 C 194.33,627.83 193.00,648.83 194.00,664.00 C 195.00,679.17 195.50,685.50 202.00,705.00 C 208.50,724.50 227.33,765.50 233.00,781.00 C 238.67,796.50 235.83,791.67 236.00,798.00 C 236.17,804.33 236.50,810.67 234.00,819.00 C 231.50,827.33 229.83,833.67 221.00,848.00 C 212.17,862.33 193.50,885.83 181.00,905.00 C 168.50,924.17 154.67,947.50 146.00,963.00 C 137.33,978.50 134.67,984.50 129.00,998.00 C 123.33,1011.50 107.67,1038.17 112.00,1044.00 C 116.33,1049.83 140.50,1035.83 155.00,1033.00 C 169.50,1030.17 184.83,1028.17 199.00,1027.00 C 213.17,1025.83 225.50,1025.67 240.00,1026.00 C 254.50,1026.33 271.33,1027.33 286.00,1029.00 C 300.67,1030.67 314.67,1033.17 328.00,1036.00 C 341.33,1038.83 343.17,1038.17 366.00,1046.00 C 388.83,1053.83 435.33,1073.00 465.00,1083.00 C 494.67,1093.00 519.33,1100.83 544.00,1106.00 C 568.67,1111.17 588.17,1112.83 613.00,1114.00 C 637.83,1115.17 687.67,1122.17 693.00,1113.00 C 698.33,1103.83 657.33,1073.67 645.00,1059.00 C 632.67,1044.33 627.00,1036.33 619.00,1025.00 C 611.00,1013.67 604.50,1005.17 597.00,991.00 C 589.50,976.83 578.83,952.83 574.00,940.00 C 569.17,927.17 568.83,924.83 568.00,914.00 C 567.17,903.17 567.50,886.00 569.00,875.00 C 570.50,864.00 574.00,855.67 577.00,848.00 C 580.00,840.33 580.83,837.17 587.00,829.00 C 593.17,820.83 606.00,806.50 614.00,799.00 C 622.00,791.50 628.00,788.33 635.00,784.00 C 642.00,779.67 646.67,777.00 656.00,773.00 C 665.33,769.00 673.33,764.83 691.00,760.00 C 708.67,755.17 724.83,750.50 762.00,744.00 C 799.17,737.50 877.67,727.50 914.00,721.00 C 950.33,714.50 961.00,710.50 980.00,705.00 C 999.00,699.50 1012.33,694.83 1028.00,688.00 C 1043.67,681.17 1061.33,671.67 1074.00,664.00 C 1086.67,656.33 1094.17,650.50 1104.00,642.00 C 1113.83,633.50 1125.17,621.83 1133.00,613.00 C 1140.83,604.17 1159.17,589.50 1151.00,589.00 C 1142.83,588.50 1113.17,602.33 1084.00,610.00 C 1054.83,617.67 1003.67,629.17 976.00,635.00 C 948.33,640.83 937.00,642.50 918.00,645.00 C 899.00,647.50 877.83,649.17 862.00,650.00 C 846.17,650.83 838.17,650.83 823.00,650.00 C 807.83,649.17 789.83,647.83 771.00,645.00 C 752.17,642.17 733.00,638.00 710.00,633.00 C 687.00,628.00 646.50,618.50 633.00,615.00 C 619.50,611.50 623.00,612.67 629.00,612.00 C 635.00,611.33 642.00,608.67 669.00,611.00 C 696.00,613.33 759.50,623.33 791.00,626.00 C 822.50,628.67 833.83,628.33 858.00,627.00 C 882.17,625.67 902.33,623.50 936.00,618.00 C 969.67,612.50 1028.50,600.67 1060.00,594.00 C 1091.50,587.33 1110.33,582.00 1125.00,578.00 C 1139.67,574.00 1141.17,573.17 1148.00,570.00 C 1154.83,566.83 1162.17,563.00 1166.00,559.00 C 1169.83,555.00 1170.00,551.00 1171.00,546.00 C 1172.00,541.00 1172.17,534.00 1172.00,529.00 C 1171.83,524.00 1171.67,521.33 1170.00,516.00 C 1168.33,510.67 1166.50,504.17 1162.00,497.00 Z"/>
  </g>
  <g fill="#000000">
    <path d="M 569.00,311.00 C 559.33,314.00 540.83,321.00 531.00,326.00 C 521.17,331.00 516.83,334.83 510.00,341.00 C 503.17,347.17 496.17,353.83 490.00,363.00 C 483.83,372.17 476.83,385.67 473.00,396.00 C 469.17,406.33 468.00,416.83 467.00,425.00 C 466.00,433.17 466.50,438.83 467.00,445.00 C 467.50,451.17 467.50,454.33 470.00,462.00 C 472.50,469.67 478.33,483.83 482.00,491.00 C 485.67,498.17 487.67,500.00 492.00,505.00 C 496.33,510.00 502.67,516.50 508.00,521.00 C 513.33,525.50 516.33,528.00 524.00,532.00 C 531.67,536.00 543.67,541.83 554.00,545.00 C 564.33,548.17 575.00,550.17 586.00,551.00 C 597.00,551.83 609.00,551.33 620.00,550.00 C 631.00,548.67 639.83,547.00 652.00,543.00 C 664.17,539.00 680.67,532.17 693.00,526.00 C 705.33,519.83 715.83,513.17 726.00,506.00 C 736.17,498.83 750.17,493.00 754.00,483.00 C 757.83,473.00 752.33,460.00 749.00,446.00 C 745.67,432.00 739.33,411.83 734.00,399.00 C 728.67,386.17 723.00,377.67 717.00,369.00 C 711.00,360.33 705.83,354.17 698.00,347.00 C 690.17,339.83 680.33,331.83 670.00,326.00 C 659.67,320.17 645.50,315.00 636.00,312.00 C 626.50,309.00 620.83,308.67 613.00,308.00 C 605.17,307.33 596.33,307.50 589.00,308.00 C 581.67,308.50 578.67,308.00 569.00,311.00 Z"/>
    <path d="M 1164.00,562.00 C 1164.00,559.17 1156.83,567.33 1151.00,570.00 C 1145.17,572.67 1143.33,574.00 1129.00,578.00 C 1114.67,582.00 1094.00,587.67 1065.00,594.00 C 1036.00,600.33 986.67,610.50 955.00,616.00 C 923.33,621.50 900.17,625.00 875.00,627.00 C 849.83,629.00 838.67,630.50 804.00,628.00 C 769.33,625.50 695.67,614.50 667.00,612.00 C 638.33,609.50 623.33,609.33 632.00,613.00 C 640.67,616.67 694.50,628.67 719.00,634.00 C 743.50,639.33 761.17,642.50 779.00,645.00 C 796.83,647.50 807.50,648.67 826.00,649.00 C 844.50,649.33 864.33,649.67 890.00,647.00 C 915.67,644.33 940.67,641.33 980.00,633.00 C 1019.33,624.67 1097.50,604.67 1126.00,597.00 C 1154.50,589.33 1144.67,592.83 1151.00,587.00 C 1157.33,581.17 1164.00,564.83 1164.00,562.00 Z"/>
    <path d="M 1044.00,496.00 C 1043.17,498.17 1041.67,500.33 1045.00,504.00 C 1048.33,507.67 1058.50,515.00 1064.00,518.00 C 1069.50,521.00 1073.33,521.33 1078.00,522.00 C 1082.67,522.67 1088.17,523.17 1092.00,522.00 C 1095.83,520.83 1100.00,517.83 1101.00,515.00 C 1102.00,512.17 1101.50,508.67 1098.00,505.00 C 1094.50,501.33 1086.67,495.67 1080.00,493.00 C 1073.33,490.33 1063.00,489.33 1058.00,489.00 C 1053.00,488.67 1052.33,489.83 1050.00,491.00 C 1047.67,492.17 1044.83,493.83 1044.00,496.00 Z"/>
  </g>
  <g class="gecko-svg-primary" fill="var(--brand-color, #4CF00C)">
    <path d="M 627.00,338.00 C 625.83,337.67 625.33,337.33 624.00,338.00 C 622.67,338.67 621.33,338.67 619.00,342.00 C 616.67,345.33 613.00,350.50 610.00,358.00 C 607.00,365.50 603.17,378.00 601.00,387.00 C 598.83,396.00 597.67,401.33 597.00,412.00 C 596.33,422.67 596.17,439.17 597.00,451.00 C 597.83,462.83 600.00,474.00 602.00,483.00 C 604.00,492.00 606.83,499.33 609.00,505.00 C 611.17,510.67 613.00,514.17 615.00,517.00 C 617.00,519.83 619.17,521.33 621.00,522.00 C 622.83,522.67 624.50,521.83 626.00,521.00 C 627.50,520.17 627.67,521.00 630.00,517.00 C 632.33,513.00 637.00,505.17 640.00,497.00 C 643.00,488.83 646.17,476.50 648.00,468.00 C 649.83,459.50 650.50,456.00 651.00,446.00 C 651.50,436.00 651.83,419.67 651.00,408.00 C 650.17,396.33 648.00,385.00 646.00,376.00 C 644.00,367.00 641.50,360.00 639.00,354.00 C 636.50,348.00 633.00,342.67 631.00,340.00 C 629.00,337.33 628.17,338.33 627.00,338.00 Z"/>
  </g>
</svg>`;

export interface ColorModalController {
    bodyEl: HTMLElement;
    actionsEl: HTMLElement;
    initialFocusEl: HTMLElement;
    getCurrentHex: () => string;
}

export interface ColorModalCallbacks {
    initialColor?: string;
    onConfirm: (chosenHex: string) => void;
    onCancel: () => void;
}

function clamp(val: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, val));
}

export function createColorConfigModal(
    callbacks: ColorModalCallbacks,
): ColorModalController {
    const startHex =
        normalizeHex(callbacks.initialColor || DEFAULT_GECKO_BRAND_COLOR) ||
        DEFAULT_GECKO_BRAND_COLOR;

    let currentRgb: RGB = hexToRgb(startHex);
    let currentHsv = rgbToHsv(currentRgb);
    let currentHex = rgbToHex(currentRgb);

    const root = document.createElement("div");
    root.className = "gecko-color-modal";

    // Top grid: Left = Wheel + Value Bar | Right = Brand Preview + HEX + R/G/B
    const topGrid = document.createElement("div");
    topGrid.className = "gecko-color-top-grid";

    // Left Picker Area (Wheel + Value Slider)
    const pickerArea = document.createElement("div");
    pickerArea.className = "gecko-color-picker-area";

    const WHEEL_SIZE = 164;
    const wheelWrap = document.createElement("div");
    wheelWrap.className = "gecko-color-wheel-wrap";
    wheelWrap.tabIndex = 0;
    wheelWrap.setAttribute("role", "slider");
    wheelWrap.setAttribute(
        "aria-label",
        "Roda de cores: use as setas esquerda/direita para Matiz e cima/baixo para Saturação",
    );

    const wheelCanvas = document.createElement("canvas");
    wheelCanvas.className = "gecko-color-wheel-canvas";
    wheelCanvas.width = WHEEL_SIZE;
    wheelCanvas.height = WHEEL_SIZE;
    wheelWrap.appendChild(wheelCanvas);

    const VALUE_WIDTH = 24;
    const VALUE_HEIGHT = 164;
    const valueWrap = document.createElement("div");
    valueWrap.className = "gecko-color-value-wrap";
    valueWrap.tabIndex = 0;
    valueWrap.setAttribute("role", "slider");
    valueWrap.setAttribute(
        "aria-label",
        "Intensidade de brilho: use as setas cima/baixo para ajustar",
    );

    const valueCanvas = document.createElement("canvas");
    valueCanvas.className = "gecko-color-value-canvas";
    valueCanvas.width = VALUE_WIDTH;
    valueCanvas.height = VALUE_HEIGHT;
    valueWrap.appendChild(valueCanvas);

    pickerArea.appendChild(wheelWrap);
    pickerArea.appendChild(valueWrap);

    // Right Controls Area (Brand Preview + HEX Input + R/G/B Inputs)
    const controlsArea = document.createElement("div");
    controlsArea.className = "gecko-color-controls-area";

    // Brand Live Preview Box (Logo SVG + Gecko Title + Active Badge)
    const brandPreviewBox = document.createElement("div");
    brandPreviewBox.className = "gecko-color-brand-preview";

    const brandPreviewLeft = document.createElement("div");
    brandPreviewLeft.className = "gecko-color-brand-identity";
    brandPreviewLeft.innerHTML = `${GECKO_DYNAMIC_LOGO_SVG}<span class="app-brand-title">Gecko</span>`;

    const brandHexBadge = document.createElement("span");
    brandHexBadge.className = "gecko-color-brand-badge";
    brandHexBadge.textContent = currentHex;

    brandPreviewBox.appendChild(brandPreviewLeft);
    brandPreviewBox.appendChild(brandHexBadge);
    controlsArea.appendChild(brandPreviewBox);

    // HEX Input Group
    const hexGroup = document.createElement("div");
    hexGroup.className = "gecko-form-group";
    const hexLabel = document.createElement("label");
    hexLabel.className = "gecko-form-label";
    hexLabel.textContent = "Código Hexadecimal";
    const hexInput = document.createElement("input");
    hexInput.type = "text";
    hexInput.className = "gecko-form-input gecko-color-hex-input";
    hexInput.maxLength = 7;
    hexInput.spellcheck = false;
    hexInput.autocomplete = "off";
    hexInput.placeholder = "#4CF00C";
    hexInput.value = currentHex;
    hexGroup.appendChild(hexLabel);
    hexGroup.appendChild(hexInput);
    controlsArea.appendChild(hexGroup);

    // RGB Inputs Row (R, G, B)
    const rgbRow = document.createElement("div");
    rgbRow.className = "gecko-color-rgb-row";

    const createChannelField = (
        channelLabel: string,
        initialVal: number,
        onChange: (val: number) => void,
    ) => {
        const wrap = document.createElement("div");
        wrap.className = "gecko-color-rgb-field";

        const lbl = document.createElement("label");
        lbl.className = "gecko-form-label";
        lbl.textContent = channelLabel;

        const inp = document.createElement("input");
        inp.type = "text";
        inp.inputMode = "numeric";
        inp.maxLength = 3;
        inp.className = "gecko-form-input gecko-color-rgb-input";
        inp.value = String(initialVal);

        inp.addEventListener("input", () => {
            const cleaned = inp.value.replace(/[^0-9]/g, "");
            if (cleaned === "") return;
            const num = clamp(parseInt(cleaned, 10), 0, 255);
            onChange(num);
        });

        inp.addEventListener("blur", () => {
            inp.value = String(
                channelLabel === "R"
                    ? currentRgb.r
                    : channelLabel === "G"
                      ? currentRgb.g
                      : currentRgb.b,
            );
        });

        inp.addEventListener("keydown", (e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                e.stopPropagation();
                const step = e.shiftKey ? 10 : 1;
                const delta = e.key === "ArrowUp" ? step : -step;
                const cur =
                    channelLabel === "R"
                        ? currentRgb.r
                        : channelLabel === "G"
                          ? currentRgb.g
                          : currentRgb.b;
                const next = clamp(cur + delta, 0, 255);
                inp.value = String(next);
                onChange(next);
            }
        });

        wrap.appendChild(lbl);
        wrap.appendChild(inp);
        return { wrap, input: inp };
    };

    const rField = createChannelField("R", currentRgb.r, (r) => {
        updateFromRgb({ ...currentRgb, r }, "rgb");
    });
    const gField = createChannelField("G", currentRgb.g, (g) => {
        updateFromRgb({ ...currentRgb, g }, "rgb");
    });
    const bField = createChannelField("B", currentRgb.b, (b) => {
        updateFromRgb({ ...currentRgb, b }, "rgb");
    });

    rgbRow.appendChild(rField.wrap);
    rgbRow.appendChild(gField.wrap);
    rgbRow.appendChild(bField.wrap);
    controlsArea.appendChild(rgbRow);

    // Keyboard Hint inside controls
    const kbHint = document.createElement("div");
    kbHint.className = "gecko-color-kb-hint";
    kbHint.textContent =
        "Teclado: Tab navega entre Roda, Brilho, HEX e RGB · Setas ajustam valores";
    controlsArea.appendChild(kbHint);

    topGrid.appendChild(pickerArea);
    topGrid.appendChild(controlsArea);
    root.appendChild(topGrid);

    // Bottom Section: Automatically Derived Tones Strip
    const tonesSection = document.createElement("div");
    tonesSection.className = "gecko-color-tones-section";

    const tonesTitle = document.createElement("div");
    tonesTitle.className = "gecko-form-label";
    tonesTitle.textContent = "Tons Derivados Automaticamente";
    tonesSection.appendChild(tonesTitle);

    const tonesGrid = document.createElement("div");
    tonesGrid.className = "gecko-color-tones-grid";

    interface ToneSwatchRefs {
        colorBox: HTMLElement;
        hexText: HTMLElement;
    }

    const createToneCell = (title: string): ToneSwatchRefs => {
        const cell = document.createElement("div");
        cell.className = "gecko-color-tone-cell";

        const colorBox = document.createElement("div");
        colorBox.className = "gecko-color-tone-swatch";

        const meta = document.createElement("div");
        meta.className = "gecko-color-tone-meta";

        const nameSpan = document.createElement("span");
        nameSpan.className = "gecko-color-tone-name";
        nameSpan.textContent = title;

        const hexSpan = document.createElement("span");
        hexSpan.className = "gecko-color-tone-hex";

        meta.appendChild(nameSpan);
        meta.appendChild(hexSpan);
        cell.appendChild(colorBox);
        cell.appendChild(meta);
        tonesGrid.appendChild(cell);

        return { colorBox, hexText: hexSpan };
    };

    const swatchBrand = createToneCell("Marca / Logo");
    const swatchAccent = createToneCell("Acento UI");
    const swatchHover = createToneCell("Hover");
    const swatchHeading = createToneCell("Título MD");
    const swatchSelection = createToneCell("Seleção");

    tonesSection.appendChild(tonesGrid);
    root.appendChild(tonesSection);

    // Precompute base HSV (V=100) wheel ImageData once for instant 0ms rendering
    const wheelCtx = wheelCanvas.getContext("2d");
    const valueCtx = valueCanvas.getContext("2d");
    const baseWheelImage = wheelCtx
        ? wheelCtx.createImageData(WHEEL_SIZE, WHEEL_SIZE)
        : null;

    if (baseWheelImage) {
        const cx = WHEEL_SIZE / 2;
        const cy = WHEEL_SIZE / 2;
        const radius = WHEEL_SIZE / 2 - 2;
        const data = baseWheelImage.data;

        for (let y = 0; y < WHEEL_SIZE; y++) {
            for (let x = 0; x < WHEEL_SIZE; x++) {
                const dx = x - cx;
                const dy = y - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const idx = (y * WHEEL_SIZE + x) * 4;

                if (dist <= radius + 0.8) {
                    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
                    const h = (angle + 360) % 360;
                    const s = Math.min(100, (dist / radius) * 100);
                    const rgb = hsvToRgb({ h, s, v: 100 });
                    // Smooth anti-aliased edge on the outer 1px border of the circle
                    const alpha =
                        dist > radius - 0.5
                            ? Math.max(0, Math.min(1, radius + 0.8 - dist))
                            : 1;
                    data[idx] = rgb.r;
                    data[idx + 1] = rgb.g;
                    data[idx + 2] = rgb.b;
                    data[idx + 3] = Math.round(alpha * 255);
                } else {
                    data[idx + 3] = 0;
                }
            }
        }
    }

    const drawWheelAndValue = () => {
        if (wheelCtx && baseWheelImage) {
            wheelCtx.clearRect(0, 0, WHEEL_SIZE, WHEEL_SIZE);
            wheelCtx.putImageData(baseWheelImage, 0, 0);

            const cx = WHEEL_SIZE / 2;
            const cy = WHEEL_SIZE / 2;
            const radius = WHEEL_SIZE / 2 - 2;

            // Darken overlay proportional to (100 - v)
            const darkness = 1 - currentHsv.v / 100;
            if (darkness > 0.01) {
                wheelCtx.save();
                wheelCtx.beginPath();
                wheelCtx.arc(cx, cy, radius, 0, Math.PI * 2);
                wheelCtx.fillStyle = `rgba(0, 0, 0, ${darkness.toFixed(3)})`;
                wheelCtx.fill();
                wheelCtx.restore();
            }

            // Structural 1px border around wheel
            wheelCtx.save();
            wheelCtx.beginPath();
            wheelCtx.arc(cx, cy, radius, 0, Math.PI * 2);
            wheelCtx.strokeStyle = "#2B2B2B";
            wheelCtx.lineWidth = 1;
            wheelCtx.stroke();
            wheelCtx.restore();

            // Reticle marker at (h, s)
            const rad = (currentHsv.h * Math.PI) / 180;
            const dist = (currentHsv.s / 100) * radius;
            const px = cx + Math.cos(rad) * dist;
            const py = cy + Math.sin(rad) * dist;

            wheelCtx.save();
            wheelCtx.beginPath();
            wheelCtx.arc(px, py, 5.5, 0, Math.PI * 2);
            wheelCtx.strokeStyle = "#000000";
            wheelCtx.lineWidth = 2.5;
            wheelCtx.stroke();

            wheelCtx.beginPath();
            wheelCtx.arc(px, py, 5.5, 0, Math.PI * 2);
            wheelCtx.strokeStyle = "#FFFFFF";
            wheelCtx.lineWidth = 1.2;
            wheelCtx.stroke();
            wheelCtx.restore();
        }

        if (valueCtx) {
            valueCtx.clearRect(0, 0, VALUE_WIDTH, VALUE_HEIGHT);
            const grad = valueCtx.createLinearGradient(0, 0, 0, VALUE_HEIGHT);
            const topRgb = hsvToRgb({
                h: currentHsv.h,
                s: currentHsv.s,
                v: 100,
            });
            const botRgb = hsvToRgb({
                h: currentHsv.h,
                s: currentHsv.s,
                v: 8,
            });
            grad.addColorStop(0, rgbToHex(topRgb));
            grad.addColorStop(1, rgbToHex(botRgb));

            valueCtx.fillStyle = grad;
            valueCtx.fillRect(0, 0, VALUE_WIDTH, VALUE_HEIGHT);

            // Indicator bar at current V (8..100)
            const normV = clamp((currentHsv.v - 8) / 92, 0, 1);
            const y = Math.round((1 - normV) * (VALUE_HEIGHT - 6)) + 3;

            valueCtx.fillStyle = "#000000";
            valueCtx.fillRect(0, y - 3, VALUE_WIDTH, 6);
            valueCtx.strokeStyle = "#FFFFFF";
            valueCtx.lineWidth = 1.5;
            valueCtx.strokeRect(1, y - 2, VALUE_WIDTH - 2, 4);
        }

        wheelWrap.setAttribute(
            "aria-valuetext",
            `Matiz ${Math.round(currentHsv.h)}°, Saturação ${Math.round(currentHsv.s)}%`,
        );
        valueWrap.setAttribute(
            "aria-valuenow",
            String(Math.round(currentHsv.v)),
        );
        valueWrap.setAttribute(
            "aria-valuetext",
            `Brilho ${Math.round(currentHsv.v)}%`,
        );
    };

    const syncSwatches = (palette: GeckoDerivedPalette) => {
        brandHexBadge.textContent = palette.brandColor;

        swatchBrand.colorBox.style.backgroundColor = palette.brandColor;
        swatchBrand.hexText.textContent = palette.brandColor;

        swatchAccent.colorBox.style.backgroundColor = palette.accentPrimary;
        swatchAccent.hexText.textContent = palette.accentPrimary;

        swatchHover.colorBox.style.backgroundColor = palette.accentHover;
        swatchHover.hexText.textContent = palette.accentHover;

        swatchHeading.colorBox.style.backgroundColor = palette.mdHeading;
        swatchHeading.hexText.textContent = palette.mdHeading;

        swatchSelection.colorBox.style.backgroundColor = palette.bgSelection;
        swatchSelection.hexText.textContent = palette.bgSelection;
    };

    const applyLiveUpdate = (source: "hsv" | "hex" | "rgb" | "preset") => {
        if (source !== "hex") {
            hexInput.value = currentHex;
        }
        if (source !== "rgb") {
            rField.input.value = String(currentRgb.r);
            gField.input.value = String(currentRgb.g);
            bField.input.value = String(currentRgb.b);
        }
        drawWheelAndValue();
        const palette = applyGeckoThemeColor(currentHex, false);
        syncSwatches(palette);
    };

    const updateFromHsv = (nextHsv: { h: number; s: number; v: number }) => {
        currentHsv = {
            h: ((nextHsv.h % 360) + 360) % 360,
            s: clamp(nextHsv.s, 0, 100),
            v: clamp(nextHsv.v, 8, 100),
        };
        currentRgb = hsvToRgb(currentHsv);
        currentHex = rgbToHex(currentRgb);
        applyLiveUpdate("hsv");
    };

    const updateFromRgb = (nextRgb: RGB, source: "rgb" | "preset") => {
        currentRgb = {
            r: clamp(Math.round(nextRgb.r), 0, 255),
            g: clamp(Math.round(nextRgb.g), 0, 255),
            b: clamp(Math.round(nextRgb.b), 0, 255),
        };
        currentHsv = rgbToHsv(currentRgb);
        currentHex = rgbToHex(currentRgb);
        applyLiveUpdate(source);
    };

    // Pointer interaction on Wheel
    const handleWheelPointer = (clientX: number, clientY: number) => {
        const rect = wheelCanvas.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const radius = rect.width / 2 - 2;
        const dx = clientX - rect.left - cx;
        const dy = clientY - rect.top - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        const h = (angle + 360) % 360;
        const s = clamp((dist / radius) * 100, 0, 100);
        updateFromHsv({ h, s, v: Math.max(15, currentHsv.v) });
    };

    wheelWrap.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        wheelWrap.focus();
        wheelWrap.setPointerCapture(e.pointerId);
        handleWheelPointer(e.clientX, e.clientY);

        const onMove = (ev: PointerEvent) => {
            handleWheelPointer(ev.clientX, ev.clientY);
        };
        const onUp = (ev: PointerEvent) => {
            wheelWrap.releasePointerCapture(ev.pointerId);
            wheelWrap.removeEventListener("pointermove", onMove);
            wheelWrap.removeEventListener("pointerup", onUp);
            wheelWrap.removeEventListener("pointercancel", onUp);
        };
        wheelWrap.addEventListener("pointermove", onMove);
        wheelWrap.addEventListener("pointerup", onUp);
        wheelWrap.addEventListener("pointercancel", onUp);
    });

    // Keyboard interaction on Wheel (Arrows adjust Hue / Saturation)
    wheelWrap.addEventListener("keydown", (e) => {
        const stepH = e.shiftKey ? 15 : 3;
        const stepS = e.shiftKey ? 10 : 3;
        if (e.key === "ArrowLeft") {
            e.preventDefault();
            e.stopPropagation();
            updateFromHsv({ ...currentHsv, h: currentHsv.h - stepH });
        } else if (e.key === "ArrowRight") {
            e.preventDefault();
            e.stopPropagation();
            updateFromHsv({ ...currentHsv, h: currentHsv.h + stepH });
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            e.stopPropagation();
            updateFromHsv({ ...currentHsv, s: currentHsv.s + stepS });
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            e.stopPropagation();
            updateFromHsv({ ...currentHsv, s: currentHsv.s - stepS });
        } else if (e.key === "Home") {
            e.preventDefault();
            e.stopPropagation();
            updateFromHsv({ ...currentHsv, s: 0 });
        } else if (e.key === "End") {
            e.preventDefault();
            e.stopPropagation();
            updateFromHsv({ ...currentHsv, s: 100 });
        }
    });

    // Pointer interaction on Value Bar
    const handleValuePointer = (clientY: number) => {
        const rect = valueCanvas.getBoundingClientRect();
        const relY = clamp(clientY - rect.top, 0, rect.height);
        const v = 100 - (relY / rect.height) * 92;
        updateFromHsv({ ...currentHsv, v });
    };

    valueWrap.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        valueWrap.focus();
        valueWrap.setPointerCapture(e.pointerId);
        handleValuePointer(e.clientY);

        const onMove = (ev: PointerEvent) => {
            handleValuePointer(ev.clientY);
        };
        const onUp = (ev: PointerEvent) => {
            valueWrap.releasePointerCapture(ev.pointerId);
            valueWrap.removeEventListener("pointermove", onMove);
            valueWrap.removeEventListener("pointerup", onUp);
            valueWrap.removeEventListener("pointercancel", onUp);
        };
        valueWrap.addEventListener("pointermove", onMove);
        valueWrap.addEventListener("pointerup", onUp);
        valueWrap.addEventListener("pointercancel", onUp);
    });

    // Keyboard interaction on Value Bar
    valueWrap.addEventListener("keydown", (e) => {
        const stepV = e.shiftKey ? 10 : 2;
        if (e.key === "ArrowUp" || e.key === "ArrowRight") {
            e.preventDefault();
            e.stopPropagation();
            updateFromHsv({ ...currentHsv, v: currentHsv.v + stepV });
        } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
            e.preventDefault();
            e.stopPropagation();
            updateFromHsv({ ...currentHsv, v: currentHsv.v - stepV });
        } else if (e.key === "Home") {
            e.preventDefault();
            e.stopPropagation();
            updateFromHsv({ ...currentHsv, v: 100 });
        } else if (e.key === "End") {
            e.preventDefault();
            e.stopPropagation();
            updateFromHsv({ ...currentHsv, v: 8 });
        }
    });

    // HEX Input events
    hexInput.addEventListener("input", () => {
        const raw = hexInput.value.trim();
        if (/^#?[0-9a-fA-F]{6}$/.test(raw)) {
            const norm = normalizeHex(raw);
            if (norm) {
                currentHex = norm;
                currentRgb = hexToRgb(norm);
                currentHsv = rgbToHsv(currentRgb);
                applyLiveUpdate("hex");
            }
        }
    });

    hexInput.addEventListener("blur", () => {
        const norm = normalizeHex(hexInput.value);
        if (norm) {
            currentHex = norm;
            currentRgb = hexToRgb(norm);
            currentHsv = rgbToHsv(currentRgb);
            applyLiveUpdate("preset");
        } else {
            hexInput.value = currentHex;
        }
    });

    // Footer Actions (Left: Restaurar Padrão | Right: Cancelar + Confirmar)
    const actionsWrap = document.createElement("div");
    actionsWrap.className = "modal-actions-space-between";

    const btnReset = document.createElement("button");
    btnReset.type = "button";
    btnReset.className = "action-btn";
    btnReset.textContent = "Restaurar Padrão (#4CF00C)";
    btnReset.addEventListener("click", () => {
        updateFromRgb(hexToRgb(DEFAULT_GECKO_BRAND_COLOR), "preset");
    });

    const rightBtns = document.createElement("div");
    rightBtns.className = "modal-actions-right";

    const btnCancel = document.createElement("button");
    btnCancel.type = "button";
    btnCancel.className = "action-btn";
    btnCancel.textContent = "Cancelar";
    btnCancel.addEventListener("click", () => {
        callbacks.onCancel();
    });

    const btnConfirm = document.createElement("button");
    btnConfirm.type = "button";
    btnConfirm.className = "action-btn primary";
    btnConfirm.textContent = "Confirmar";
    btnConfirm.addEventListener("click", () => {
        callbacks.onConfirm(currentHex);
    });

    rightBtns.appendChild(btnCancel);
    rightBtns.appendChild(btnConfirm);
    actionsWrap.appendChild(btnReset);
    actionsWrap.appendChild(rightBtns);

    // Initial render
    applyLiveUpdate("preset");

    return {
        bodyEl: root,
        actionsEl: actionsWrap,
        initialFocusEl: wheelWrap,
        getCurrentHex: () => currentHex,
    };
}
