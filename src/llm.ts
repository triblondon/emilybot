import ollama from 'ollama'

interface Result {
  caption: string;
  keywords: string[];
  contrast: number;
  lighting: number;
  focus: number;
  numPeople: number;
  happinessScore: number;
  hasDog: boolean;
  hasBaby: boolean;
}

const PROMPT = `
    Generate a valid JSON output comprising an object with the following properties: 
    
    - 'caption': A one line, punchy but wholesome caption for the image - for example, if the image depicts a family eating dinner, the caption could be "Save room for dessert!  For the purposes of the caption assume the following:
          - if there is a dog in the image, it is female and called Bonbon
          - if there a baby it is a boy called Stanley
    - 'keywords': array of 3-5 strings that describe the image, where each string is a single word
    - 'contrast': a score from 0 to 1 indicating a judgement about whether the image has good contrast, where 0 is bad and 1 is good.
    - 'lighting': a score from 0 to 1 indicating a judgement about whether the image has good lighting, where 0 is bad and 1 is good.
    - 'focus': a score from 0 to 1 indicating a judgement about whether the image is in focus, where 0 is blurry and 1 is sharp.
    - 'numPeople': a number indicating how many people are depicted in the image.
    - 'happinessScore': a score from 0 to 1 indicating a judgement about whether the image depicts happiness, where 0 is no happiness and 1 is maximum happiness.
    - 'hasDog': a boolean indicating whether a dog is present in the image.
    - 'hasBaby': a boolean indicating whether a baby is present in the image.
`;

const judgeImage = async (imagePath: string): Promise<Result> => {
  const output = await ollama.generate({ model: "gemma3", prompt: PROMPT, images: [imagePath] });
  const responseText = output.response.replace(/^```json\s*(.*?)\s*```$/s, '$1');
  const data = JSON.parse(responseText);
  console.log(data);
  return data;
}

export default judgeImage;