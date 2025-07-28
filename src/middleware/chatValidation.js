// src/middleware/chatValidation.js - Input validation middleware
export function validateChatParams(req, res, next) {
    const { prompt, model, maxTokens, temperature } = req.body;

    if (!model || typeof model !== 'string' || model.trim().length === 0) {
        return res.status(400).json({ 
            error: 'Model is required and must be a non-empty string' 
        });
    }
    
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        return res.status(400).json({ 
            error: 'Prompt is required and must be a non-empty string' 
        });
    }
    
    if (prompt.length > 10000) {
        return res.status(400).json({ 
            error: 'Prompt too long. Maximum 10000 characters allowed.' 
        });
    }
    
    if (maxTokens && (typeof maxTokens !== 'number' || maxTokens < 1 || maxTokens > 4000)) {
        return res.status(400).json({ 
            error: 'maxTokens must be a number between 1 and 4000' 
        });
    }
    
    if (temperature && (typeof temperature !== 'number' || temperature < 0 || temperature > 1)) {
        return res.status(400).json({ 
            error: 'temperature must be a number between 0 and 1' 
        });
    }
    
    next();
};