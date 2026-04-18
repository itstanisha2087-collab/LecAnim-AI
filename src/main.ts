import './index.css';
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createIcons, Sparkles, UploadCloud, Box, Layers, CheckSquare, Settings, Loader2, FileUp, Maximize, Info, ChevronLeft, ChevronRight, ClipboardList, MessageSquare, X, ArrowUp, Play, Pause, RotateCcw } from 'lucide';

// Initialize Lucide Icons
createIcons({
    icons: {
        Sparkles, UploadCloud, Box, Layers, CheckSquare, Settings, Loader2, FileUp, Maximize, Info, ChevronLeft, ChevronRight, ClipboardList, MessageSquare, X, ArrowUp, Play, Pause, RotateCcw
    }
});

// Types
interface NarrativeStep {
    object: string;
    motion: string;
    title: string;
    description: string;
    color: string;
}
interface Flashcard {
    question: string;
    answer: string;
}

interface QuizQuestion {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
}

interface SceneDescription {
    object: string;
    motion: string;
    description: string;
    title: string;
    color: string;
}

// Global State
let currentPDFContent = "";
let flashcards: Flashcard[] = [];
let quizQuestions: QuizQuestion[] = [];
let narrativeSteps: NarrativeStep[] = [];
let currentSceneIndex = 0;
let isPlaying = false;
let currentCardIndex = 0;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let animationId: number;
let currentObject: THREE.Object3D | null = null;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// --- UI Logic ---

function initTabs() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.getAttribute('data-tab');
            
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            tabContents.forEach(content => {
                if (content.id === `tab-${tabId}`) {
                    content.classList.remove('hidden');
                } else {
                    content.classList.add('hidden');
                }
            });

            // Handle 3D canvas resize when switching to animation tab
            if (tabId === 'animation') {
                setTimeout(onWindowResize, 0);
            }
        });
    });
}

function initFlashcardsUI() {
    const card = document.getElementById('flashcard');
    card?.addEventListener('click', () => {
        card.classList.toggle('flipped');
    });

    document.getElementById('next-card')?.addEventListener('click', () => {
        if (flashcards.length === 0) return;
        currentCardIndex = (currentCardIndex + 1) % flashcards.length;
        updateFlashcard();
    });

    document.getElementById('prev-card')?.addEventListener('click', () => {
        if (flashcards.length === 0) return;
        currentCardIndex = (currentCardIndex - 1 + flashcards.length) % flashcards.length;
        updateFlashcard();
    });
}

function updateFlashcard() {
    if (flashcards.length === 0) return;
    const qEl = document.getElementById('card-question');
    const aEl = document.getElementById('card-answer');
    const currentIdxEl = document.getElementById('current-card-index');
    const totalEl = document.getElementById('total-cards');
    const card = document.getElementById('flashcard');

    if (qEl) qEl.textContent = flashcards[currentCardIndex].question;
    if (aEl) aEl.textContent = flashcards[currentCardIndex].answer;
    if (currentIdxEl) currentIdxEl.textContent = (currentCardIndex + 1).toString();
    if (totalEl) totalEl.textContent = flashcards.length.toString();
    
    card?.classList.remove('flipped');
}

// --- 3D Logic ---

function initThree() {
    const container = document.getElementById('canvas-container');
    if (!container) return;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    camera.position.z = 5;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    animate();
}

function animate() {
    animationId = requestAnimationFrame(animate);
    controls.update();
    
    if (currentObject && isPlaying) {
        const time = Date.now() * 0.001;
        const currentStep = narrativeSteps[currentSceneIndex];
        
        if (currentStep) {
            switch (currentStep.motion) {
                case 'rotate':
                    currentObject.rotation.y += 0.02;
                    currentObject.rotation.x += 0.01;
                    break;
                case 'pulse':
                    const s = 1 + Math.sin(time * 3) * 0.2;
                    currentObject.scale.set(s, s, s);
                    break;
                case 'float':
                    currentObject.position.y = Math.sin(time * 2) * 0.5;
                    currentObject.rotation.z = Math.sin(time) * 0.1;
                    break;
            }
        }
    }
    
    renderer.render(scene, camera);
}

function onWindowResize() {
    const container = document.getElementById('canvas-container');
    if (!container || !camera || !renderer) return;
    
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

window.addEventListener('resize', onWindowResize);

function updateThreeScene(index: number) {
    if (!narrativeSteps.length || index < 0 || index >= narrativeSteps.length) return;
    
    currentSceneIndex = index;
    const step = narrativeSteps[index];

    // Clear current object
    if (currentObject) {
        scene.remove(currentObject);
    }

    let geometry: THREE.BufferGeometry;
    let material: THREE.Material = new THREE.MeshPhongMaterial({ 
        color: step.color || '#3b82f6',
        shininess: 100
    });

    switch (step.object.toLowerCase()) {
        case 'cube':
        case 'box':
            geometry = new THREE.BoxGeometry(2, 2, 2);
            break;
        case 'sphere':
        case 'ball':
            geometry = new THREE.SphereGeometry(1.5, 32, 32);
            break;
        case 'torus':
        case 'donut':
            geometry = new THREE.TorusGeometry(1.2, 0.4, 16, 100);
            break;
        case 'cone':
            geometry = new THREE.ConeGeometry(1.5, 3, 32);
            break;
        default:
            geometry = new THREE.IcosahedronGeometry(2, 0);
    }

    currentObject = new THREE.Mesh(geometry, material);
    scene.add(currentObject);

    // Reset Scale/Pos
    currentObject.scale.set(1, 1, 1);
    currentObject.position.set(0, 0, 0);

    // Update UI info
    const titleEl = document.getElementById('scene-title');
    const descEl = document.getElementById('scene-description');
    const progressEl = document.getElementById('animation-progress');

    if (titleEl) titleEl.textContent = `${step.title} (${index + 1}/${narrativeSteps.length})`;
    if (descEl) descEl.textContent = step.description;
    if (progressEl) progressEl.style.width = `${((index + 1) / narrativeSteps.length) * 100}%`;
}

function initPlaybackControls() {
    const playPauseBtn = document.getElementById('play-pause');
    const playIcon = document.getElementById('play-icon');
    const pauseIcon = document.getElementById('pause-icon');
    const nextBtn = document.getElementById('next-scene');
    const prevBtn = document.getElementById('prev-scene');
    const restartBtn = document.getElementById('restart-animation');

    playPauseBtn?.addEventListener('click', () => {
        isPlaying = !isPlaying;
        if (playIcon) playIcon.classList.toggle('hidden', isPlaying);
        if (pauseIcon) pauseIcon.classList.toggle('hidden', !isPlaying);
    });

    nextBtn?.addEventListener('click', () => {
        if (currentSceneIndex < narrativeSteps.length - 1) {
            updateThreeScene(currentSceneIndex + 1);
        }
    });

    prevBtn?.addEventListener('click', () => {
        if (currentSceneIndex > 0) {
            updateThreeScene(currentSceneIndex - 1);
        }
    });

    restartBtn?.addEventListener('click', () => {
        updateThreeScene(0);
    });
}

// --- AI Integration ---

async function processPDF(file: File) {
    const statusEl = document.getElementById('processing-status');
    const filenameEl = document.getElementById('current-filename');
    const dropZoneDefault = document.getElementById('drop-zone-default');
    const dropZoneLoading = document.getElementById('drop-zone-loading');
    const loadingText = dropZoneLoading?.querySelector('p');

    if (statusEl) statusEl.classList.remove('hidden');
    if (filenameEl) filenameEl.textContent = file.name;
    if (dropZoneDefault) dropZoneDefault.classList.add('hidden');
    if (dropZoneLoading) dropZoneLoading.classList.remove('hidden');

    try {
        const base64 = await fileToBase64(file);
        
        // PHASE 1: Immediate Storyboard & Summary (Fastest)
        if (loadingText) loadingText.textContent = "Creating your 3D narrative...";
        
        const narrativeResponse = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [
                {
                    parts: [
                        { text: "Analyze this lecture PDF. Create a 'Funny Cartoon Narrative' that explains the core concepts in 3 steps (be extremely concise). Return a JSON object with: 1) structure: a 1-sentence hook, 2) narrative: an array of EXACTLY 3 objects {object, motion, title, description, color}. Use funny analogies. Keep descriptions under 15 words. Objects: 'sphere', 'cube', 'torus', 'cone'. Motions: 'rotate', 'pulse', 'float'." },
                        { 
                            inlineData: {
                                data: base64.split(',')[1],
                                mimeType: "application/pdf"
                            }
                        }
                    ]
                }
            ],
            config: {
                thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        structure: { type: Type.STRING },
                        narrative: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    object: { type: Type.STRING },
                                    motion: { type: Type.STRING },
                                    title: { type: Type.STRING },
                                    description: { type: Type.STRING },
                                    color: { type: Type.STRING }
                                }
                            }
                        }
                    }
                }
            }
        });

        const narrativeData = JSON.parse(narrativeResponse.text);
        narrativeSteps = narrativeData.narrative || [];
        currentPDFContent = narrativeData.structure || "";
        
        if (narrativeSteps.length) {
            updateThreeScene(0);
            isPlaying = true;
            const playIcon = document.getElementById('play-icon');
            const pauseIcon = document.getElementById('pause-icon');
            if (playIcon) playIcon.classList.add('hidden');
            if (pauseIcon) pauseIcon.classList.remove('hidden');
        }

        // Switch to animation tab IMMEDIATELY after Phase 1
        document.querySelector<HTMLElement>('[data-tab="animation"]')?.click();
        
        // Hide drop zone loading as tab switched
        if (dropZoneDefault) dropZoneDefault.classList.remove('hidden');
        if (dropZoneLoading) dropZoneLoading.classList.add('hidden');

        // PHASE 2: Background Flashcards & Quiz (Slower, won't block the video)
        if (statusEl) {
            const statusContent = statusEl.querySelector('div');
            if (statusContent) statusContent.innerHTML = `<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i> Building Study Tools...`;
            createIcons();
        }

        const studyResponse = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [
                {
                    parts: [
                        { text: "Generate study tools from this PDF. Return JSON: 1) flashcards: EXACTLY 5 high-quality {question, answer}, 2) quiz: EXACTLY 3 {question, options, correctIndex, explanation}." },
                        { 
                            inlineData: {
                                data: base64.split(',')[1],
                                mimeType: "application/pdf"
                            }
                        }
                    ]
                }
            ],
            config: {
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        flashcards: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: { question: { type: Type.STRING }, answer: { type: Type.STRING } }
                            }
                        },
                        quiz: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    question: { type: Type.STRING },
                                    options: { type: Type.ARRAY, items: { type: Type.STRING } },
                                    correctIndex: { type: Type.NUMBER },
                                    explanation: { type: Type.STRING }
                                }
                            }
                        }
                    }
                }
            }
        });

        const studyData = JSON.parse(studyResponse.text);
        flashcards = studyData.flashcards || [];
        quizQuestions = studyData.quiz || [];
        
        updateFlashcard();
        renderQuiz();

    } catch (error) {
        console.error("Error processing PDF:", error);
        alert("Failed to process PDF. Please try again.");
        if (dropZoneDefault) dropZoneDefault.classList.remove('hidden');
        if (dropZoneLoading) dropZoneLoading.classList.add('hidden');
    } finally {
        if (statusEl) statusEl.classList.add('hidden');
    }
}

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
}

function renderQuiz() {
    const container = document.getElementById('quiz-container');
    const footer = document.getElementById('quiz-footer');
    if (!container) return;

    if (quizQuestions.length === 0) {
        container.innerHTML = `<div class="bg-white p-12 rounded-[32px] border border-gray-100 shadow-xl shadow-gray-200/50 text-center">
            <i data-lucide="clipboard-list" class="w-12 h-12 text-gray-200 mx-auto mb-4"></i>
            <p class="text-gray-500">No quiz generated for this document.</p>
        </div>`;
        footer?.classList.add('hidden');
        createIcons();
        return;
    }

    footer?.classList.remove('hidden');
    container.innerHTML = quizQuestions.map((q, qIdx) => `
        <div class="bg-white p-8 rounded-[32px] border border-gray-100 shadow-lg shadow-gray-200/30">
            <h3 class="text-xl font-bold mb-6">${q.question}</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                ${q.options.map((opt, oIdx) => `
                    <button class="quiz-option" data-q="${qIdx}" data-o="${oIdx}">
                        ${opt}
                    </button>
                `).join('')}
            </div>
            <div id="explanation-${qIdx}" class="mt-6 p-4 bg-blue-50 text-blue-800 rounded-2xl text-sm hidden">
                <p class="font-bold mb-1">Explanation:</p>
                <p>${q.explanation}</p>
            </div>
        </div>
    `).join('');

    // Add click events for options
    document.querySelectorAll('.quiz-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const qIdx = parseInt(btn.getAttribute('data-q')!);
            const oIdx = parseInt(btn.getAttribute('data-o')!);
            
            // Clear previous selections for this question
            document.querySelectorAll(`.quiz-option[data-q="${qIdx}"]`).forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
    });
}

document.getElementById('submit-quiz')?.addEventListener('click', () => {
    quizQuestions.forEach((q, qIdx) => {
        const selected = document.querySelector(`.quiz-option[data-q="${qIdx}"].selected`);
        const explanation = document.getElementById(`explanation-${qIdx}`);
        
        if (selected) {
            const oIdx = parseInt(selected.getAttribute('data-o')!);
            if (oIdx === q.correctIndex) {
                selected.classList.add('correct');
            } else {
                selected.classList.add('incorrect');
                // Show the correct one too
                document.querySelector(`.quiz-option[data-q="${qIdx}"][data-o="${q.correctIndex}"]`)?.classList.add('correct');
            }
        } else {
            // Show the correct one if none selected
            document.querySelector(`.quiz-option[data-q="${qIdx}"][data-o="${q.correctIndex}"]`)?.classList.add('correct');
        }
        
        explanation?.classList.remove('hidden');
    });
});

// --- Chat Logic ---

async function sendChat() {
    const input = document.getElementById('chat-input') as HTMLTextAreaElement;
    const container = document.getElementById('chat-messages');
    if (!input || !container || !input.value.trim()) return;

    const userMessage = input.value.trim();
    input.value = "";
    
    // Add user message to UI
    appendMessage('user', userMessage);

    const chat = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
            systemInstruction: `You are LecAnim AI's Doubt Solver. You are helping a student with their lecture document. 
            The document summary is: ${currentPDFContent || "No document uploaded yet."}
            Only answer questions based on the provided document or general academic knowledge related to the topic. 
            Be concise, helpful, and professional. Use markdown for formatting.`
        }
    });

    const botBubble = appendMessage('bot', '');
    const botText = botBubble.querySelector('p');
    if (!botText) return;

    try {
        const stream = await chat.sendMessageStream({ message: userMessage });
        let fullText = "";
        for await (const chunk of stream) {
            fullText += chunk.text || "";
            botText.textContent = fullText;
            container.scrollTop = container.scrollHeight;
        }
    } catch (error) {
        botText.textContent = "Sorry, I encountered an error. Please try again.";
        console.error("Chat error:", error);
    }
}

function appendMessage(role: 'user' | 'bot', text: string) {
    const container = document.getElementById('chat-messages');
    if (!container) return document.createElement('div');

    const div = document.createElement('div');
    div.className = `chat-bubble ${role} animate-in fade-in slide-in-from-${role === 'user' ? 'right' : 'left'}-2 duration-300 mb-3 last:mb-0`;
    div.innerHTML = `<p>${text}</p>`;
    
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
}

document.getElementById('send-chat')?.addEventListener('click', sendChat);
document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChat();
    }
});

// --- File Handling ---

function initFileUpload() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input') as HTMLInputElement;

    dropZone?.addEventListener('click', () => fileInput.click());

    dropZone?.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-blue-400', 'bg-blue-50/30');
    });

    dropZone?.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-blue-400', 'bg-blue-50/30');
    });

    dropZone?.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-blue-400', 'bg-blue-50/30');
        const file = e.dataTransfer?.files[0];
        if (file && file.type === 'application/pdf') {
            processPDF(file);
        } else {
            alert("Please upload a PDF file.");
        }
    });

    fileInput?.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (file) {
            processPDF(file);
        }
    });
}

// --- Init ---

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initFlashcardsUI();
    initThree();
    initFileUpload();
    initPlaybackControls();
    
    // Mobile chat toggle
    const mobileChatToggle = document.getElementById('mobile-chat-toggle');
    const chatSidebar = document.getElementById('chat-sidebar');
    mobileChatToggle?.addEventListener('click', () => {
        chatSidebar?.classList.toggle('hidden');
        chatSidebar?.classList.toggle('flex');
        chatSidebar?.classList.toggle('fixed');
        chatSidebar?.classList.toggle('inset-0');
        chatSidebar?.classList.toggle('w-full');
    });
});
