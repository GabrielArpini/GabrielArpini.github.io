---
title: If attention has a sink, where is it?
date: 2026-06-05 12:00:00 -0300
categories: [LLM, Attention]
tags: [Attention]
math: true
---

When i was building my inference engine from scratch, i stumbled upon a very strange phenomenon, i built a perplexity
benchmark to evaluate how well my implementation of the LLaMA 3.2 was doing, but i got a very far off value from the expected,
at first i thought: "Well, i must have messed up some part of the benchmark, the architecture is mostly correct.", but
after a very long time debugging the benchmark i was not able to find anything, my head got fuzzy since it was a silent problem.
Then i thought, maybe my code for generation is selecting the wrong tokens, my greedy algorithm may be wrong, but the same as before, nothing.
I was biased that the architecture was correct since it was inspired in the real LLaMA architecture, there's no way i messed it up, but then, when inspecting
the model's logits, there it was.

The first position of the logits had infinite values and the remaining positions had real numbers, then it was clear:
some operation downstream was exploding the number of bits FP16 can support, that justifies the inf values, but what about
the problem being only in the first position?

## The sink
After diving deep into the inner working of the LLaMA model, i found the explanation for the problem:
The LLaMA model have a residual stream of the excess of attention directed to the position 0, this "focus point" of the residual
streams is called *sink*. But, why the first token have that attention "focus point", but the others doesn't? Often, the first tokens doesn't hold
that much significance for the remaining sequence, so why it gets all the attention?

## Where the sink came from?

Remember BERT? That strange phenomenon was first seen in [an analysis of the BERT model's attention](https://arxiv.org/abs/1906.04341). The behavior showed up there first, but the name *attention sink* itself came later, from the [StreamingLLM](https://arxiv.org/abs/2309.17453) paper, which is where it got pinned down in the decoder models we use today.

The BERT model had a tendency to hyperfocus on the `[SEP]` separator token, and to a smaller degree on periods and commas. In other words, BERT had a sink pattern on those tokens across a sequence. And the interesting part is why it picks them, the analysis found that heads attend to `[SEP]` not because it carries meaning, but as a fallback, a head points there when its specialized job doesn't apply to the token it is looking at.

Models tend to move weight to anchors due to softmax, which we will see in a moment. But first, a quick analogy to grasp the intuition behind it:

Imagine that you have a sequence of words and you have an arbitrary budget of how much you can invest in each word. Your boss wants to see all the budget gone at the end of the day, so you need to figure out how to invest broadly across the sequence, while maintaining certain priorities, since our language is based across the relationship of words. You see a word that is very important for the overall sequence, you invest all the word budget there. But what about a word that is not fully relevant at the end? If you invest all your budget on it, the investment will be hard to justify and your boss will be angry. Instead, you invest a little, and you spread the remaining budget across other words. Broad coverage, priorities where they count.

That is what a human accountant would do. Models do not do that.

What models actually do is pick an anchor. One token where they dump the leftover budget every time, instead of spreading it across the sequence. Not "invest a little here, share the rest around", but "pile the rest onto one chosen spot".

In BERT's case, the chosen anchors were `[SEP]` and punctuation. And that choice is not arbitrary. Those tokens show up reliably across every input, so a head always has them available to fall back on. So the model is not just dumping at random, it is leaning on tokens that are always there, and using them as a place to dump attention it has no use for.

## Why attention have residuals after all?
You may ask, why we have this budget for each word? why it's not a flexible value so we can simply invest just the necessary?
Well, that's a great question and the answer is surprisingly simple. The attention mechanism attends to every token in the sequence, even the ones that are not so relevant for the conceptual meaning of the sequence. More formally, it comes from the SoftMax operation, the Softmax receives the logits and computes them in a way that their sum is equal to 1, so we can interpret them as probabilities of attention scores. This idea of the sum must be equal to 1 is our boss saying that we should use all the budget, from our previous analogy. So, the budget of tokens with no relevance must go to some place, making the sum equal to 1 at the end. Since models are very, very data heavy, they tend to stream the residual attention budget to the places that mostly appear in the training dataset, in the case of BERT it is the delimiter and periods. The LLaMa model and many others have a tendency to use this residual in the first token, that's why the first position had this phenomenon that broke the perplexity benchmark result, i simply didnt account it in my architecture building, so now the only remaining task is to find which of the operations downstream from SoftMax is having the overflow that is resulting in the inf values.

## Tracing the overflow
I needed to figure out which of the operations that uses logits have this problem of overflowing the data type, my first guess was: it must be something that the residuals sum up to and the guess was pretty clear.
After the attention block comes the RMSNorm, a layer normalization that runs once all the residual additions have accumulated, after looking at it i saw this `x.pow(2)`, `x` was FP16 so using pow() on it must be the thing that is breaking the layer, specially if the residual accumulation gets bigger because of a long sequence. And here it's worth separating two things that are easy to mix up, the attention sink is the pattern of every query dumping its leftover attention on the first token, but the thing that actually overflowed is what people call a [massive activation](https://arxiv.org/abs/2402.17762), a few dimensions in the residual stream of that same token that grow to enormous magnitudes. They live on the same token and one feeds the other, but to be precise it's that giant value getting squared in FP16 that blows up, not the attention weights themselves. I did a quick debug and it was really the problem, but now, what's the best solution here?
I've searched how people solve this and it's pretty simple, there's no shenanigan after all, we just upcast it to fp32, do the operation and downcast back to fp16, two line changes that made my perplexity reduce from 49 to 9.

## It's a matter of framing
You may still be curious about the sink, i was too. After the discovery of the attention sink, researchers did what they do best, they researched. There are a few competing explanations floating around, the one i want to focus on is a recent geometric take on the attention sink phenomenon with some cool math, you can read the paper [here](https://arxiv.org/abs/2508.02546). It's one way of looking at it, not the settled answer, but i think it's the most intuitive one.

Since the attention mechanism is based on the relationship of many high dimension representation spaces to calculate relationships of tokens, it needs stable reference points to make those calculations. The stable reference points comes not from a specific component of the transformer architecture, but comes from the inner working of them, like nature the transformer tends to settle into the lowest "energy" spending path. The SoftMax forces that the sum must be equal to 1, but the value vectors simply cannot be 0 or nothing and via the following structure:

$$
\mathcal{R} = (\mathcal{M}, \mathcal{P}, \phi)
$$

Which is the formal definition of the reference frame in the transformer, where $\mathcal{M}$ is the representation manifold, $\mathcal{P}$ is a set of reference tokens and $\phi: \mathcal{M} \times \mathcal{P} \to \mathbb{R}^d$ is a mapping function that establish the relationship of an arbitrary point to the reference points in $\mathcal{P}$ set. But why this structure exists after all?

By creating a formal representation of the coordinate system in which each arbitrary point is located in relation to a subset of reference points independently of their semantic relationship, we can define explicitly a threshold, measured in frequency, which generalize the sinking flow to reference points, enabling a formal definition of the sink itself.

$$
\operatorname{sink}(p) = \left[\frac{1}{n}\sum_{i=1}^{n}\mathbb{1}\{\alpha_{i,p} \geq \tau\}\right] \geq \gamma
$$

Where $\alpha_{i,p}$ is the attention weight that query $i$ assigns to a reference point $p$, $\mathbb{1}\{\cdot\}$ is the indicator function (1 when the condition holds, 0 otherwise), $n$ is the number of queries in the sequence, $\tau$ is the per-weight threshold that decides what counts as "substantial" attention (the paper sets it at the 90th percentile of attention weights) and $\gamma$ is the frequency threshold (typically $0.3$–$0.5$). So a reference point $p$ becomes a sink when the fraction of queries that point strongly at it crosses $\gamma$, no matter what it means semantically.

So, the sink is not a deterministic phenomenon, but rather a "natural" organization of the points across it's manifold, which connects with our nature analogy, for example, have you ever asked yourself why bees create hexagons to store honey? It's a nature convergence into the geometric shape that stores the most honey and have the least cost to create. The anchors are essentially the same, just a convergence into specific reference frame types, the model picks the cheapest token to dump the leftover attention on, the same way the bee picks the cheapest shape to store the honey.

And here is the thing, when i say the sink is not deterministic i don't mean it's random, it converges every single time, the same way the bee always lands on the hexagon, what i mean is that this convergence only holds as long as the constraints around it stay the same. The bee builds hexagons because the laws of physics make the hexagon the cheapest shape to store the most honey, but we can't define if the laws of physics will stay the same for the entirety of the universe, and the moment they change, the bee would converge to whatever shape is the cheapest under the new laws. The sink is the same, it's not fixed by some universal law, it's just the cheapest solution given the constraints the model lives under, the softmax forcing the budget to sum to one, the data it was trained on and the way the position is encoded. Change any of those and the cheapest place to dump the attention moves somewhere else, and that's exactly what RoPE does.


## Changing the laws with RoPE
Since this post is all about LLaMA, let's see how it changes the laws of the natural convergence into a specific reference frame type (first position).

We know that RoPE is a solution to measure how each token query and key are related in a sequence by rotating their matrices accordingly, this rotation is as simple as $m \cdot \theta$, where $\theta$ is a fixed frequency and $m$ is the position, and notice that only the query and the key get rotated, the value vector is left untouched, since the rotation only needs to live inside the $q \cdot k$ dot product to encode the relative position. As you had probably guessed about it, if the position is $0$ the rotation angle $m \cdot \theta$ is also $0$, which means that the rotation is the identity and the vector is left unchanged, and since every other token is rotated, we have a single value that stays constant across the whole attention processing.
Now, here is where i have to be careful, because it's tempting to say that since token $0$ is the unrotated one, the residuals just stream there and that's the sink, but that's not really what happens. RoPE encodes relative position, the score between a query and a key only depends on the distance between them, so being unrotated does not by itself make token $0$ more attractive, in fact RoPE tends to fade the attention as tokens get further apart, and token $0$ is the farthest one from every later token, so by that logic it should get less attention, not more. What RoPE actually does is make token $0$ the stable origin of the whole coordinate frame, the one fixed point that every other token is measured against as the sequence grows, and when you combine that with the causal mask, where token $0$ is the only token that every single query can see, you get the perfect anchor, always there, always visible and never moving. That's why the model converges its sink there, not because the residuals are forced into it, but because it's the cheapest and most reliable reference frame the constraints allow, and the attention that lands on it is almost free anyway, since the value vector of the sink barely contributes anything to the output.




