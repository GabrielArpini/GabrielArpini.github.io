---
title: On the intuition behind kv cache 
date: 2026-04-19
categories: [inference]
tags: [kvcache]
---


The inference field is in constant change, every day a new solution is proposed to optimize the inference of models by X%, to be updated on that field, i decided to create my own inference engine from scratch, where each step is an optimization standard of the industry, my latest implementation was a naive kv cache which showed great results on inference time.
Today we are going to understand intuitively what is the KV Cache, one of the most impactful ways to improve the speed of inference nowadays, which by itself changes with much frequency (the recent TurboQuant is a new optimization technique applied to kvcache that just got merged into vllm, for example).

## The why's 
By simply lexical interpretation we can infer, generally, what it does. By KV Cache we can understand that it is some kind of cache of the k(key) and v(values) matrices, but why does this make inference fast? why just k and v, why not q (query), k and v? and why cache them at all?
Well, that's a lot of questions, but they are intrinsically correlated with the inner intuition that justified the creation of the kv cache. We are going to dive on it without touching the math behind it, but focusing on creating a mental model of its inner workings. So let's dive a bit on how it was before the kv cache to understand why it exists now and why it became a golden standard in inference.

## The pre historic era
Before the existence of LLMs people used to compute text sentences using the so called RNN (Recurrent Neural Networks), which appeared back in the 80's, with later variants like LSTM (1997) trying to fix some of their problems. An RNN is a neural network that processes sequential data, where the position of every element is important, the problem with it is that it was not able to perform well in long sentences.
That happened because of inner problems with the gradients in the backpropagation, i like to see it as signal to adjust the internal values of the model, in this case the model has many neurons, so each neuron needs some adjustment based on what it saw in the final result, so backpropagation can be seen as:
1 - Model computes values and the values are compared against a loss value that we defined.
2 - Then, after getting the loss value, the backpropagation uses the gradient (the signal that is used to update the neurons into one objective idea: what tiny step (in numbers) i can do to minimize the loss?) to update the values and try to compute the loss again.
3 - Each neuron layer depending on their values will change the gradient for the next one, because we need to tune their weights in the just exact way to minimize the loss the most.

What you think will happen when we have lots and lots and lots of neuron layers? I know it's not fully clear, but think of it like a telephone whisper game: the gradient of the backpropagation tells the first layer what values it can change to improve results, that layer will tell the next something like: i changed these values and if you change your values in this specific way you will improve, and so on...
Now if we have a lot of layers the information will be lost (the signal will be weaker) and the deep neural layers will have updates that not necessarily mean good results, and if their inner value before the update are not good enough for the update, the gradient can explode or die, so every update after this kind of event will be essentially meaningless.
That was a huge problem with the RNN, because it's sequential, right? so if we have large sequences, most of the overall context will be lost inside the model and it will not be able to perform well. One of the core usages of RNN was the seq2seq approach, which used information theory to see language as signs with meaning using machine translation

### Seq2Seq 
The Seq2Seq was a paradigm shift in the way to process language by using an encoder and decoder. The encoder transformed the text input into a vector of numbers and the decoder decodes a vector of numbers back into text, thus a machine translation, in an end-to-end view it's a sequence input to sequence output. But why it was a paradigm shift?
Simply because treating text sequences as vectors that carry the information of the input, then decoding those vectors back into text, enabled many types of computation over them to compute the probabilities of the output text. But, as all solutions, it had its problem, since the encoder and decoder are all RNNs
the problem of long contexts still exists, so long input sequences encoded into the hidden states (context vectors) at some point made the decoder miss parts of the input that got, essentially, diluted into small numbers to consider, losing lots of context. To help with that, the attention mechanism was created, which is a way to selectively focus on specific parts of the sequence, just like our attention while reading works.
Attention, when it was first created, was bolted onto RNN seq2seq so the decoder could look back at all the encoder's hidden states. That fixed the context vector bottleneck, but it didn't fix the gradient problem, because the encoder and decoder were still RNNs with their long sequential chains. The real unlock came later when the transformer took attention and made it the only mechanism, killing recurrence entirely. Without the long chain, gradients flow freely, and as a bonus the whole thing trains in parallel on gpus because each position can be computed independently.

## The transformer 

Many, many years ago (2017) a bunch of guys called Vaswani et al. came up with a crazy idea: what if, instead of having a large chain processing like the RNNs, we parallelize it all and make each head attend to all elements using matrices?  Well, that looks like the definition of a crazy idea, but seeing what the actual reasoning behind it is makes total sense, the resulting paper: "Attention is All you Need",
became one of the most revolutionary computer science papers of all time and since the first models (GPT-1, BERT, etc.) the new so called LLMs evolved exponentially, not only having impact in the computer science field, but in the entire world, affecting how our world functions, with great influence in geopolitics, economics, etc. And one of the biggest challenges of using the transformer architecture from the paper is that
it is O(n^2) complexity, so it would need some crazy gpu power to run it and it would still not be efficient. The inference engineering came as a way to improve the model output speed and text quality and one of the biggest ideas was the KV Cache and lots and lots of optimization techniques, training techniques, and many others, enabling the models from today to be as good as they are.

The transformer, introduced in the "Attention is All you need", killed the idea of recurrence completely, using self-attention as the way tokens talk to each other (with feed forward networks in between, inside each transformer block). The way it works is relatively simple.
Take a text sequence, convert it into numbers (tokens), give each token a position (since order matters), and then compute the relationships between them to predict the probabilities of the next token. Each token is stored as a vector, and from that vector the model computes three projections called Q (Query), K (Key) and V (Value).

The query is what we are inputting, projected into a tensor. The key can be seen as "what is another token that is related to what i'm inputting?", and the value is simply the result of that "search". So Q asks the question, K decides which past tokens match, and V delivers the actual information.

The thing is, to search with our query projection, we need keys and values to retrieve, right? And the attention mechanism recomputes everything every time. At each decode step the new query has to look at every K,V from every previous token, like this:

```
step 1:   q1  →  [K1,V1]
step 2:   q2  →  [K1,V1]  [K2,V2]
step 3:   q3  →  [K1,V1]  [K2,V2]  [K3,V3]
step 4:   q4  →  [K1,V1]  [K2,V2]  [K3,V3]  [K4,V4]
```

Without a cache, every row is recomputed from scratch, every single step. So by the time we're generating step 4, K1,V1 has been recomputed for the fourth time, K2,V2 for the third, K3,V3 for the second, just to add one new K4,V4 at the end. See the problem? It recomputes values that were already computed, over and over. That's why KV cache exists.

## KV Cache 

One thing RNNs had for free was a context vector carried forward between steps, basically a built-in cache of what the model had seen so far. Attention loosened that idea by letting every token attend to every other one, and the transformer killed it completely by dropping recurrence. KV cache is essentially putting that context vector idea back, but only for K and V, since those are the values we actually reuse across decode steps.

The KV Cache is a way to store the K and V values already computed so when we present a query, the transformer will check what we already have stored, from previous computations, and compute exactly what is necessary. But why only K and V, why not Q too? Because at each decode step you only have one new query (the one for the token you're currently generating), previous queries are never reused, they already produced their output. K and V for every past token, on the other hand, need to be attended to by every future query, so those are the values worth caching.
To do that, it first passes through the so called "prefill" phase, which is essentially the first full transformer computation to compute all the k and v values to get the next token probabilities, then, for the next iteration,
it will already have the full kv cache stored to run just the necessary computation for next token making a huge difference in the time to compute, converting the O(n^2) complexity of attention at each decode step to simply O(n) at each step (the total work to generate N tokens still scales with n^2, but every individual step is way cheaper). So the same staircase from before now looks like this:

```
step 1:   q1  →  [K1,V1]
step 2:   q2  →  [ KV CACHE │ K1,V1 ]  [K2,V2]
step 3:   q3  →  [ KV CACHE │ K1,V1, K2,V2 ]  [K3,V3]
step 4:   q4  →  [ KV CACHE │ K1,V1, K2,V2, K3,V3 ]  [K4,V4]
```

The cache on the left carries everything we already have, growing one entry per step. The bracket on the right is the single new K,V computed at the current step. Every previous K,V is just a memory read now, no recomputation. Below is the result i had
by comparing raw results of the llama-3.2-1b without kv cache and the variant with the most naive kv cache possible, just like this blog post: 
![KV cache vs no cache benchmark on Llama 3.2 1B](/assets/img/posts/benchmark_v2_en.png)
See the difference, it's from water to wine, and that's simply a naive solution from many years ago, since then the kv cache improved in many, many ways. But to see what is in the horizon we need to understand what are the problems of the naive kv cache.


### The ugly 
The main problem with the KV Cache is that it's stored inside the GPU memory, so we need to account for that when deciding a model to fit inside the GPU to run locally. And it grows fast, here's how much it eats for llama 3.2 1B at fp16:

```
context   1k    →    32 MB
context   8k    →   256 MB
context  32k    →     1 GB
context 131k    →     4 GB   ← OOM on my 6 GB RTX 2060
```

There are many solutions to it, but it's very hard to make it small and impactful, because
if it's too small, we will need to compute more, and if it's too big, we will have problems like OOM (Out Of Memory) errors.

But size isn't the only ugly thing here, a few others pile on top.

The first one is pre-allocation waste. The naive cache reserves space for the worst case (max context, max generation), and if the request finishes early, the rest of the buffer just sits there empty. Across many concurrent requests this piles up fast, and it's exactly the kind of problem PagedAttention was designed to solve.

The second is that there's no sharing between requests. If two users hit the model with the same system prompt, each one builds its own cache from zero. Nothing is reused, even when the first thousand tokens are literally identical. Prefix caching is what fixes this later on.

The third is sneakier: at decode time the bottleneck isn't compute, it's memory bandwidth. Every step has to read the entire cache back from GPU memory, do a tiny bit of math, and write one new K,V. Making the cache smaller or smarter to read beats making the math faster, which is exactly why quantization and clever layouts matter so much.

## Optimizations 
To solve the ugly part, there are a lot of optimization techniques, of course the most recent one is the best, since it compounds what we learned with the others, but that is for general cases, if you are making your own model, for your own hardware, you will have your unique set of problems to solve, and that is my goal with my inference engine from scratch project.
Some ideas to optimize the kv cache live in how to manage its storage in a way that maximizes inference performance and minimizes storage, a few examples are: quantization (reduce the bits we use to store numbers, it reduces the specifics for a more general form), PagedAttention, sliding window, continuous batching, and many others. 
The thing is, just because it works with the high end distributed hardware system used to train big models like Opus, doesn't mean it will run as well on the low end gaming GPU, so critical thinking is needed to develop new ways to account for that. Because, in the end, the goal is to minimize the cost of AI and having it accessible for anyone, even people with bad hardware.

## Lessons from implementation 
So, the idea here is not showcasing code, there are lots of implementations online, you can see mine at the following [link](https://github.com/GabrielArpini/osso), my approach was inspired by mini-sglang. 
It's essentially an easy implementation, just need to run the full computation with a given query to compute all k and v values, store them, and then, for the next iterations, use the storage to compute new query values and store each k,v result with its respective attention head. But two bugs bit me hard during the implementation, and they're worth telling.
One of the bugs i hit during the implementation took me a while to figure out. My first version was updating the committed sequence length inside the store() method, which seemed ok at first, but then i realized that a single forward pass calls store() once for each layer, 16 times in llama 3.2 1B. So during one pass layer 0 would store and bump the seq_len, then layer 1 would read the cache thinking layer 0's write was already committed, and by the time it got to layer 15 the cache was pretending it had 15 new tokens when really only one was being generated, breaking the whole thing. See the problem? The fix was splitting the state in two, one variable for the committed length (what the outside sees) and another for the write position inside a single forward pass, with a separate advance() method called just once from the generate loop, after the forward pass finishes. This kind of bug only exists because transformers have many layers, toy implementations with a single layer don't even get the chance to hit it, and that's exactly why implementing the real thing teaches you stuff just reading papers won't.
The other bug was a fun one. The very first run OOM'd before the model even finished loading. Turns out i was pre allocating the kv buffer using config.max_seq_len, which in llama 3.2 is 131,072 tokens, and that buffer alone was eating almost 4 GB on my 6 GB RTX 2060, before any model weights were loaded. The fix was pretty simple, just adding a max_seq_len override in the constructor and setting it per call to input_len + max_new_tokens, so we only allocate what we actually need. That's exactly the "ugly" problem we talked about earlier happening in practice: the naive way assumes max context is a given and reserves everything upfront, but a real inference engine has to be smart about how much space it actually needs for each request.

One cool idea is to pre allocate buffer space to handle the sequence length, so it doesn't make unnecessary memory allocations from different types of memory, saving a few milliseconds of computation for faster output. Also, the problem with naive implementation is that it grows linearly in memory storage, so 
for very long sequences the ugly problem is very real, that's what the optimizations try to fix. Just for clarification, the kv cache stores values with dimensions: 2 (one tensor for K, one for V) × sequence length × batch size × layers × heads × head_dim × bytes_per_element (typically FP16 = 2 bytes), see how big it can be with a large sequence length? 
The main learning from implementing all this is the classic quote: "The devil is in the details". Both bugs only surface when you're building the real thing, not a toy, and that's exactly why this from-scratch approach is worth the pain.

## I see a rainbow rising

My next step is quantization, both on the kv cache and on the model weights themselves. The idea is pretty simple, just reduce the bytes_per_element value from the formula above. Instead of FP16 (2 bytes), we can use FP8, INT8, or even lower. The question to answer is: "What's the minimal value to minimize memory usage and also minimize quality degradation?"

And the field keeps moving fast. A few weeks ago Google came up with a beautiful idea, TurboQuant, which is essentially a heavy compression to bit values instead of bytes, with minimal loss, a fairy-tale using high school trigonometry that was recently merged into big inference providers like VLLM. It's not what i'm chasing for iteration 3, but it's a good reminder that there's always something new on the horizon.

Iteration 3 is quantization, where i'll see how few bits this model can survive on without falling apart. With enough curiosity to try stuff and find out, beautiful things can come into existence.

