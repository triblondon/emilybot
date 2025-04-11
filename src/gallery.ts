import * as fs from 'fs';
import * as path from 'path';
import { PhotoData } from "./types";

const constrainRange = (val: number, min: number, max: number) => Math.max(Math.min(val, max), min);

class Gallery {
    private images: Map<string, { data: PhotoData; lastShown: number; shownCount: number }> = new Map();
    private gallerySize: number;
    private currentTick: number = 0;

    constructor(gallerySize: number, cachePath?: string) {
        this.gallerySize = gallerySize;

        // Load images from cachePath
        if (cachePath && fs.existsSync(cachePath) && fs.statSync(cachePath).isDirectory()) {
            const files = fs.readdirSync(cachePath);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        const fullPath = path.join(cachePath, file);
                        const raw = fs.readFileSync(fullPath, 'utf-8');
                        const parsed = JSON.parse(raw);

                        // Validate and coerce types
                        if (parsed.timestamp && parsed.finalScore !== null && parsed.filename) {
                            const photo: PhotoData = {
                                ...parsed,
                                timestamp: new Date(parsed.timestamp)
                            };
                            this.addImage(photo);
                            if (this.images.size >= this.gallerySize) break;
                        }
                    } catch (err) {
                        console.warn(`Failed to load image from ${file}:`, err);
                    }
                }
            }
        } else {
            console.warn(`Invalid cachePath: ${cachePath}`);
        }

    }

    addImage(img: PhotoData) {
        const key = img.filename;

        if (this.images.has(key)) {
            this.images.set(key, {
                ...this.images.get(key)!,
                data: img, // update timestamp/score if needed
            });
            return;
        }

        if (this.images.size >= this.gallerySize) {
            // Remove least recently shown or lowest score image
            const toRemove = [...this.images.entries()].sort((a, b) => {
                const ageA = this.currentTick - a[1].lastShown;
                const ageB = this.currentTick - b[1].lastShown;
                const scoreA = a[1].data.finalScore || 0;
                const scoreB = b[1].data.finalScore || 0;
                return ageA !== ageB ? ageA - ageB : scoreA - scoreB;
            })[0];
            this.images.delete(toRemove[0]);
        }

        this.images.set(key, {
            data: img,
            lastShown: -Infinity,
            shownCount: 0,
        });
    }

    getNextImage(): PhotoData | null {
        if (this.images.size === 0) return null;

        this.currentTick++;

        const now = Date.now();
        const scoredImages = [...this.images.values()].map((entry) => {

            // Fresh: recently taken is better (0.5 - 2)
            const ageMinutes = (now - entry.data.timestamp.getTime()) / 1000 / 60;
            const decayTimeMinutes = 30;
            const freshnessWeight = constrainRange(2 - (ageMinutes / decayTimeMinutes), 0.5, 2);

            // Score: better is better (0.5 - 1.5), assume min score is 5
            const scoreWeight = (Math.max((entry.data.finalScore || 0) - 5, 0) / 10) + 0.5;

            // Rarity: not seen much is better (0.5 - 1.5)
            const thisImageShownFraction = (entry.shownCount / this.currentTick);
            const rarityWeight = 2 - constrainRange(thisImageShownFraction * this.images.size, 0.5, 1.5);

            // Recency weight: not shown recently is better (0.1 - 3)
            const sinceLastShown = this.currentTick - entry.lastShown;
            const recencyWeight = constrainRange(sinceLastShown / this.images.size, 0.1, 3)

            // Multiply
            const weight = freshnessWeight * scoreWeight * rarityWeight * recencyWeight;

            return {
                entry,
                weights: { freshnessWeight, scoreWeight, rarityWeight, recencyWeight },
                weight,
            };
        });
        console.log(scoredImages);

        const totalWeight = scoredImages.reduce((sum, item) => sum + item.weight, 0);
        const rand = Math.random() * totalWeight;

        let acc = 0;
        for (const { entry, weight } of scoredImages) {
            acc += weight;
            if (rand <= acc) {
                entry.lastShown = this.currentTick;
                entry.shownCount++;
                return entry.data;
            }
        }

        // Fallback (shouldn't happen): return a random image
        const fallback = [...this.images.values()][0];
        fallback.lastShown = this.currentTick;
        fallback.shownCount++;
        return fallback.data;
    }
}

export default Gallery;