import { BlnM, DescriptorUnitsValue, parseAngle, parsePercent, parseUnitsToNumber, readVersionAndDescriptor } from './descriptor';
import { BlendMode, PatternInfo } from './psd';
import {
	checkSignature, createReader, readBytes, readDataRLE, readInt16, readInt32, readPascalString, readPattern,
	readSignature, readUint16, readUint32, readUint8, skipBytes
} from './psdReader';

interface PhryDescriptor {
	hierarchy: any[];
}

interface DynamicsDescriptor {
	bVTy: number;
	fStp: number;
	jitter: DescriptorUnitsValue;
	'Mnm ': DescriptorUnitsValue;
}

interface BrushShapeDescriptor {
	Dmtr: DescriptorUnitsValue;
	Angl: DescriptorUnitsValue;
	Rndn: DescriptorUnitsValue;
	'Nm  '?: string;
	Spcn: DescriptorUnitsValue;
	Intr: boolean;
	Hrdn?: DescriptorUnitsValue;
	flipX: boolean;
	flipY: boolean;
	sampledData?: string;
}

interface DescDescriptor {
	Brsh: {
		'Nm  ': string;
		Brsh: BrushShapeDescriptor;
		useTipDynamics: boolean;
		flipX: boolean;
		flipY: boolean;
		brushProjection: boolean;
		minimumDiameter: DescriptorUnitsValue;
		minimumRoundness: DescriptorUnitsValue;
		tiltScale: DescriptorUnitsValue;
		szVr: DynamicsDescriptor;
		angleDynamics: DynamicsDescriptor;
		roundnessDynamics: DynamicsDescriptor;
		useScatter: boolean;
		Spcn: DescriptorUnitsValue;
		'Cnt ': number;
		bothAxes: boolean;
		countDynamics: DynamicsDescriptor;
		scatterDynamics: DynamicsDescriptor;
		dualBrush: { useDualBrush: false; } | {
			useDualBrush: true;
			Flip: boolean;
			Brsh: BrushShapeDescriptor;
			BlnM: string;
			useScatter: boolean;
			Spcn: DescriptorUnitsValue;
			'Cnt ': number;
			bothAxes: boolean;
			countDynamics: DynamicsDescriptor;
			scatterDynamics: DynamicsDescriptor;
		};
		brushGroup: { useBrushGroup: false; };
		useTexture: boolean;
		TxtC: boolean;
		interpretation: boolean;
		textureBlendMode: string;
		textureDepth: DescriptorUnitsValue;
		minimumDepth: DescriptorUnitsValue;
		textureDepthDynamics: DynamicsDescriptor;
		Txtr: {
			'Nm  ': string;
			Idnt: string;
		};
		textureScale: DescriptorUnitsValue;
		InvT: boolean;
		protectTexture: boolean;
		textureBrightness: number;
		textureContrast: number;
		usePaintDynamics: boolean;
		prVr?: DynamicsDescriptor;
		opVr?: DynamicsDescriptor;
		wtVr?: DynamicsDescriptor;
		mxVr?: DynamicsDescriptor;
		useColorDynamics: boolean;
		clVr?: DynamicsDescriptor;
		'H   '?: DescriptorUnitsValue;
		Strt?: DescriptorUnitsValue;
		Brgh?: DescriptorUnitsValue;
		purity?: DescriptorUnitsValue;
		colorDynamicsPerTip?: true;
		Wtdg: boolean;
		Nose: boolean;
		'Rpt ': boolean;
		useBrushSize: boolean;
		useBrushPose: boolean;
		overridePoseAngle?: boolean;
		overridePoseTiltX?: boolean;
		overridePoseTiltY?: boolean;
		overridePosePressure?: boolean;
		brushPosePressure?: DescriptorUnitsValue;
		brushPoseTiltX?: number;
		brushPoseTiltY?: number;
		brushPoseAngle?: number;
		toolOptions?: {
			brushPreset: boolean;
			flow: number;
			Smoo: number;
			'Md  ': string;
			Opct: number;
			smoothing: boolean;
			smoothingValue: number;
			smoothingRadiusMode: boolean;
			smoothingCatchup: boolean;
			smoothingCatchupAtEnd: boolean;
			smoothingZoomCompensation: boolean;
			pressureSmoothing: boolean;
			usePressureOverridesSize: boolean;
			usePressureOverridesOpacity: boolean;
			useLegacy: boolean;
		};
	}[];
}

interface Sample {
	id: string;
	bounds: { x: number; y: number; w: number; h: number; };
	alpha: Uint8Array;
}

interface Dynamics {
	control: 'off' | 'fade' | 'pen pressure' | 'pen tilt' | 'stylus wheel' | 'initial direction' | 'direction' | 'initial rotation' | 'rotation';
	steps: number;
	jitter: number;
	minimum: number;
}

const dynamicsControl = ['off', 'fade', 'pen pressure', 'pen tilt', 'stylus sheel', 'initial direction', 'direction', 'initial rotation', 'rotation'];

interface BrushShape {
	name?: string;
	size: number;
	angle: number;
	roundness: number;
	hardness?: number;
	spacingOn: boolean;
	spacing: number;
	flipX: boolean;
	flipY: boolean;
	sampledData?: string;
}

interface Brush {
	name: string;
	shape: BrushShape;
	shapeDynamics?: {
		sizeDynamics: Dynamics;
		minimumDiameter: number;
		tiltScale: number;
		angleDynamics: Dynamics;
		roundnessDynamics: Dynamics;
		minimumRoundness: number;
		flipX: boolean;
		flipY: boolean;
		brushProjection: boolean;
	};
	scatter?: {
		bothAxes: boolean;
		scatterDynamics: Dynamics;
		countDynamics: Dynamics;
		count: number;
	};
	texture?: {
		id: string;
		name: string;
		invert: boolean;
		scale: number;
		brightness: number;
		contrast: number;
		blendMode: BlendMode;
		depth: number;
		depthMinimum: number;
		depthDynamics: Dynamics;
	};
	dualBrush?: {
		flip: boolean;
		shape: BrushShape;
		blendMode: BlendMode;
		useScatter: boolean;
		spacing: number;
		count: number;
		bothAxes: boolean;
		countDynamics: Dynamics;
		scatterDynamics: Dynamics;
	};
	colorDynamics?: {
		foregroundBackground: Dynamics;
		hue: number;
		saturation: number;
		brightness: number;
		purity: number;
		perTip: boolean;
	};
	transfer?: {
		flowDynamics: Dynamics;
		opacityDynamics: Dynamics;
		wetnessDynamics: Dynamics;
		mixDynamics: Dynamics;
	};
	brushPose?: {
		overrideAngle: boolean;
		overrideTiltX: boolean;
		overrideTiltY: boolean;
		overridePressure: boolean;
		pressure: number;
		tiltX: number;
		tiltY: number;
		angle: number;
	};
	noise: boolean;
	wetEdges: boolean;
	// TODO: build-up
	// TODO: smoothing
	protectTexture?: boolean;
	spacing: number;
	brushGroup?: undefined; // ?
	interpretation: boolean; // ?
	useBrushSize: boolean; // ?
	toolOptions?: {
		brushPreset: boolean;
		flow: number;
		smooth: number; // ?
		mode: BlendMode;
		opacity: number;
		smoothing: boolean;
		smoothingValue: number;
		smoothingRadiusMode: boolean;
		smoothingCatchup: boolean;
		smoothingCatchupAtEnd: boolean;
		smoothingZoomCompensation: boolean;
		pressureSmoothing: boolean;
		usePressureOverridesSize: boolean;
		usePressureOverridesOpacity: boolean;
		useLegacy: boolean;
	};
}

function parseDynamics(desc: DynamicsDescriptor): Dynamics {
	return {
		control: dynamicsControl[desc.bVTy] as any,
		steps: desc.fStp,
		jitter: parsePercent(desc.jitter),
		minimum: parsePercent(desc['Mnm ']),
	};
}

function parseBrushShape(desc: BrushShapeDescriptor): BrushShape {
	return {
		size: parseUnitsToNumber(desc.Dmtr, 'Pixels'),
		angle: parseAngle(desc.Angl),
		roundness: parsePercent(desc.Rndn),
		name: desc['Nm  '],
		spacingOn: desc.Intr,
		spacing: parsePercent(desc.Spcn),
		hardness: desc.Hrdn && parsePercent(desc.Hrdn),
		flipX: desc.flipX,
		flipY: desc.flipY,
		sampledData: desc.sampledData,
	};
}

export function readAbr(buffer: ArrayBufferView) {
	const reader = createReader(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	const version = readInt16(reader);
	const samples: Sample[] = [];
	const brushes: Brush[] = [];
	const patterns: PatternInfo[] = [];

	if (version === 1 || version === 2) {
		throw new Error('not implemented (version 1/2)'); // TODO: ...
	} else if (version === 6 || version === 7 || version === 10) {
		const minorVersion = readInt16(reader);
		if (minorVersion !== 1 && minorVersion !== 2) throw new Error('Unsupported ABR version');

		while (reader.offset < reader.view.byteLength) {
			// console.log('left', reader.view.byteLength - reader.offset, 'at', reader.offset.toString(16));
			checkSignature(reader, '8BIM');
			const type = readSignature(reader); // samp | desc | patt | phry
			const size = readUint32(reader);
			const end = reader.offset + size;

			switch (type) {
				case 'samp': {
					while (reader.offset < end) {
						let brushLength = readUint32(reader);
						while (brushLength & 0b11) brushLength++; // pad to 4 byte alignment
						const brushEnd = reader.offset + brushLength;

						const id = readPascalString(reader, 1);

						// v1 - Skip the Int16 bounds rectangle and the unknown Int16.
						// v2 - Skip the unknown bytes.
						skipBytes(reader, minorVersion === 1 ? 10 : 264);

						const y = readInt32(reader);
						const x = readInt32(reader);
						const h = readInt32(reader) - y;
						const w = readInt32(reader) - x;
						if (w <= 0 || h <= 0) throw new Error('Invalid bounds');

						const depth = readInt16(reader);
						const compression = readUint8(reader); // 0 - raw, 1 - RLE
						const alpha = new Uint8Array(w * h);

						if (depth === 8) {
							if (compression === 0) {
								alpha.set(readBytes(reader, alpha.byteLength));
							} else if (compression === 1) {
								readDataRLE(reader, { width: w, height: h, data: alpha }, w, h, 1, [0]);
							} else {
								throw new Error('Invalid compression');
							}
						} else if (depth === 16) {
							if (compression === 0) {
								for (let i = 0; i < alpha.byteLength; i++) {
									alpha[i] = readUint16(reader) >> 8; // convert to 8bit values
								}
							} else if (compression === 1) {
								throw new Error('not implemented (16bit RLE)'); // TODO: ...
							} else {
								throw new Error('Invalid compression');
							}
						} else {
							throw new Error('Invalid depth');
						}

						samples.push({ id, bounds: { x, y, w, h }, alpha });
						reader.offset = brushEnd;
					}
					break;
				}
				case 'desc': {
					const desc: DescDescriptor = readVersionAndDescriptor(reader);
					console.log(require('util').inspect(desc, false, 99, true));

					for (const brush of desc.Brsh) {
						const b: Brush = {
							name: brush['Nm  '],
							shape: parseBrushShape(brush.Brsh),
							spacing: parsePercent(brush.Spcn),
							// TODO: brushGroup ???
							interpretation: brush.interpretation, // ???
							protectTexture: brush.protectTexture,
							wetEdges: brush.Wtdg,
							noise: brush.Nose,
							// TODO: TxtC ??? smoothing / build-up ?
							// TODO: 'Rpt ' ???
							useBrushSize: brush.useBrushSize, // ???
						};

						if (brush.useTipDynamics) {
							b.shapeDynamics = {
								tiltScale: parsePercent(brush.tiltScale),
								sizeDynamics: parseDynamics(brush.szVr),
								angleDynamics: parseDynamics(brush.angleDynamics),
								roundnessDynamics: parseDynamics(brush.roundnessDynamics),
								flipX: brush.flipX,
								flipY: brush.flipY,
								brushProjection: brush.brushProjection,
								minimumDiameter: parsePercent(brush.minimumDiameter),
								minimumRoundness: parsePercent(brush.minimumRoundness),
							};
						}

						if (brush.useScatter) {
							b.scatter = {
								count: brush['Cnt '],
								bothAxes: brush.bothAxes,
								countDynamics: parseDynamics(brush.countDynamics),
								scatterDynamics: parseDynamics(brush.scatterDynamics),
							};
						}

						if (brush.useTexture) {
							b.texture = {
								id: brush.Txtr.Idnt,
								name: brush.Txtr['Nm  '],
								blendMode: BlnM.decode(brush.textureBlendMode),
								depth: parsePercent(brush.textureDepth),
								depthMinimum: parsePercent(brush.minimumDepth),
								depthDynamics: parseDynamics(brush.textureDepthDynamics),
								scale: parsePercent(brush.textureScale),
								invert: brush.InvT,
								brightness: brush.textureBrightness,
								contrast: brush.textureContrast,
							};
						}

						if (brush.dualBrush && brush.dualBrush.useDualBrush) {
							b.dualBrush = {
								flip: brush.dualBrush.Flip,
								shape: parseBrushShape(brush.dualBrush.Brsh),
								blendMode: BlnM.decode(brush.dualBrush.BlnM),
								useScatter: brush.dualBrush.useScatter,
								spacing: parsePercent(brush.dualBrush.Spcn),
								count: brush.dualBrush['Cnt '],
								bothAxes: brush.dualBrush.bothAxes,
								countDynamics: parseDynamics(brush.dualBrush.countDynamics),
								scatterDynamics: parseDynamics(brush.dualBrush.scatterDynamics),
							};
						}

						if (brush.useColorDynamics) {
							b.colorDynamics = {
								foregroundBackground: parseDynamics(brush.clVr!),
								hue: parsePercent(brush['H   ']!),
								saturation: parsePercent(brush.Strt!),
								brightness: parsePercent(brush.Brgh!),
								purity: parsePercent(brush.purity!),
								perTip: brush.colorDynamicsPerTip!,
							};
						}

						if (brush.usePaintDynamics) {
							b.transfer = {
								flowDynamics: parseDynamics(brush.prVr!),
								opacityDynamics: parseDynamics(brush.opVr!),
								wetnessDynamics: parseDynamics(brush.wtVr!),
								mixDynamics: parseDynamics(brush.mxVr!),
							};
						}

						if (brush.useBrushPose) {
							b.brushPose = {
								overrideAngle: brush.overridePoseAngle!,
								overrideTiltX: brush.overridePoseTiltX!,
								overrideTiltY: brush.overridePoseTiltY!,
								overridePressure: brush.overridePosePressure!,
								pressure: parsePercent(brush.brushPosePressure!),
								tiltX: brush.brushPoseTiltX!,
								tiltY: brush.brushPoseTiltY!,
								angle: brush.brushPoseAngle!,
							};
						}

						if (brush.toolOptions) {
							b.toolOptions = {
								brushPreset: brush.toolOptions.brushPreset,
								flow: brush.toolOptions.flow,
								smooth: brush.toolOptions.Smoo,
								mode: BlnM.decode(brush.toolOptions['Md  ']),
								opacity: brush.toolOptions.Opct,
								smoothing: brush.toolOptions.smoothing,
								smoothingValue: brush.toolOptions.smoothingValue,
								smoothingRadiusMode: brush.toolOptions.smoothingRadiusMode,
								smoothingCatchup: brush.toolOptions.smoothingCatchup,
								smoothingCatchupAtEnd: brush.toolOptions.smoothingCatchupAtEnd,
								smoothingZoomCompensation: brush.toolOptions.smoothingZoomCompensation,
								pressureSmoothing: brush.toolOptions.pressureSmoothing,
								usePressureOverridesSize: brush.toolOptions.usePressureOverridesSize,
								usePressureOverridesOpacity: brush.toolOptions.usePressureOverridesOpacity,
								useLegacy: brush.toolOptions.useLegacy,
							};
						}

						brushes.push(b);
					}
					break;
				}
				case 'patt': {
					patterns.push(readPattern(reader));
					reader.offset = end;
					break;
				}
				case 'phry': {
					// TODO: what is this ?
					const desc: PhryDescriptor = readVersionAndDescriptor(reader);
					desc; // ignore
					break;
				}
				default:
					throw new Error(`Invalid brush type: ${type}`);
			}
		}
	} else {
		throw new Error('Unsupported ABR version');
	}

	return { samples, patterns, brushes };
}
