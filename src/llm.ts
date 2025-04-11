import ollama from 'ollama';
import sharp from 'sharp';

export interface Result {
  caption: string;
  keywords: string[];
  leastInterestingCorner: string;
  contrast: number;
  lighting: number;
  focus: number;
  framing: number;
  numPeople: number;
  happinessScore: number;
  hasDog: boolean;
  hasBaby: boolean;
  llmScore: number;
}

const MAX_IMAGE_SIZE = 800;

const judgeImage = async (imagePath: string, photographerName: string): Promise<Result> => {
  const prompt = `Examine this image.  Generate a valid JSON output comprising an object with the following properties: 
    
    - 'keywords': array of 3-5 strings that describe the image, where each string is a single word.  Avoid 'family', 'party', 'celebration' and 'wedding'.
    - 'contrast': a score from 0 to 1 indicating a judgement about whether the image has good contrast, where 0 is bad and 1 is good.
    - 'lighting': a score from 0 to 1 indicating a judgement about whether the image has good lighting, where 0 is bad and 1 is good.
    - 'framing': a score from 0 to 1 indicating a judgement about whether the image is well framed, where 0 is bad and 1 is good.
    - 'focus': a score from 0 to 1 indicating a judgement about whether the image is in focus, where 0 is blurry and 1 is sharp.
    - 'numPeople': a number indicating how many people are depicted in the image.
    - 'happinessScore': a score from 0 to 1 indicating a judgement about whether the image depicts happiness, where 0 is no happiness and 1 is maximum happiness.
    - 'hasDog': a boolean indicating whether a dog is present in the image.
    - 'hasBaby': a boolean indicating whether a baby is present in the image.
    - 'llmScore': integer between 1 and 6, score based on overall judgement of whether it's a good photo, based on focus, lighting, contrast, framing, number of people, and happiness.
    - 'alt': A simple one line description of the image
    - 'caption': A one line, punchy but wholesome caption for the image - for example, if the image depicts a family eating dinner, the caption could be "Save room for dessert!"
    - 'leastInterestingCorner': Which quadrant of the image contains the fewest faces?  Set to the string 'topright', 'bottomright', 'topleft' or 'bottomleft'.
  `;
  const imgData = await sharp(imagePath).resize({ width: MAX_IMAGE_SIZE, height: MAX_IMAGE_SIZE, fit: 'inside' }).toBuffer();
  const output = await ollama.generate({ model: "llava", prompt, images: [imgData.toString('base64')], format: 'json', keep_alive: 0 });
  try {
    const data = JSON.parse(output.response);
    //console.log(data);
    return data;
  } catch {
    console.log(output.response);
    throw new Error("LLM did not return valid JSON");
  }
}

export default judgeImage;