---
title: What does closing a model actually protect?
date: 2026-07-28 12:00:00 -0300
categories: [LLM, Security]
tags: [distillation, security]
math: true
---

In the last few months a huge discussion took place, should AI models be open weighted or should the frontier ones stay fully closed for security purposes? As an open source guy myself im heavily biased into the open weight models, AI should be something everyone can access, study and build on top of, and we are seeing the opposite from some of the biggest labs. Im not the only one thinking that either, Jensen Huang, CEO of NVIDIA, and plenty of other big players have defended open models. Linux revolutionized software because people were allowed to open it, break it and build whatever the hell they wanted on top of it, and i don't think AI will be that different, in one way or another the same conflict is happening all over again.

But some readers may already be asking, why are the labs closing their models at all? There are plenty of reasons and one of them is safety, LLM's got so good at biology, chemistry, cybersecurity and autonomous tool use that being worried about them as an attack tool is completely fair. [Fable](https://www.anthropic.com/news/claude-fable-5-mythos-5) came fully guard railed and lobotomized just because of that, it refuses entire domains like research biology and most of cybersecurity, you can't even turn its thinking off and it never gives you back its raw reasoning, only a summary of it. But that is not the only reason.

Models are extremely good at producing useful text given an input, well... that's the entire product. The problem for the labs is that those outputs can also become training data. A smaller lab can create a massive collection of good input and output pairs from a frontier model and use those pairs to improve a cheaper one, it doesn't need the weights, it doesn't even need the original dataset, it just needs to ask millions of carefully picked questions and learn from the answers. That process is called knowledge distillation, and when it happens with permission it's a completely normal technique, the labs do it internally all the time to ship smaller and faster versions of their own models. When another company extracts those outputs at scale without authorization, evading restrictions and hiding where the traffic came from, the same technique starts being called a distillation attack.

So what exactly are the labs protecting when they close a model? That's what i want to understand here.

## What is knowledge distillation?

Knowledge distillation can be defined as the transfer of knowledge from a teacher model to a student model. The teacher is normally bigger, stronger or more expensive, the student is normally smaller, cheaper or specialized in one task, and instead of training the student only from the original dataset we also train it to reproduce the behavior of the teacher. The concept is in nature simple, the number of ways to do it is not, so let's start with the classical case, where we have access to the teacher's output probabilities.

### Distillation with logits and logprobs

At each generation step an LLM computes a score for every token in its vocabulary and those scores are called logits. A logit by itself doesn't have a meaning for us, so to turn it into a probability distribution we apply the softmax:

$$
q_i = \frac{\exp(z_i / T)}{\sum_j \exp(z_j / T)}
$$

Where $z_i$ is the logit for token $i$, $T$ is the temperature and $q_i$ is the probability that ends up assigned to that token, and a logprob is just the natural logarithm of one of those probabilities.

You probably already know the temperature as the thing that makes a model more or less creative, and that's useful, but mathematically it's controlling how sharp or how flat that distribution will be. With a low temperature the biggest logits dominate and the model becomes *almost* deterministic (by floating point variations and many internal operations it's impossible to make it fully deterministic, that's why it's almost), and with a high temperature the whole thing flattens out and alternatives that would normally get nothing start becoming visible.

That flattening is exactly why the temperature matters here, because the student is not only learning which token the teacher picked, it's learning how the teacher spread the probability across everything else. Imagine the teacher gets "the capital of France is" and produces Paris at 0.94, Lyon at 0.02, Marseille at 0.01, London at 0.005 and banana at basically zero. If we only save the final token the label tells the student one thing, output is Paris. But the whole distribution tells it much more, it says that Lyon is wrong and still lives in the same conceptual neighbourhood as Paris, that London at least got the "capital" part right, and that banana has nothing to do with anything. The relative probabilities of the wrong answers carry information about how the teacher understands the input, and that's what people call **dark knowledge**. Cool name right?

The whole thing was formalized by [Hinton, Vinyals and Dean back in 2015](https://arxiv.org/abs/1503.02531), you can read more about it in that paper. During the classical distillation the teacher produces those soft targets at a high temperature, the student trains at that same high temperature trying to reproduce them, and once it's trained it goes back to a temperature of 1. If the teacher gives probability $p_i$ to a token and the student gives $q_i$, the gradient of the soft target cross entropy in relation to each logit of the student simplifies into:

$$
\frac{\partial C}{\partial z_i} = \frac{1}{T}\left(q_i - p_i\right)
$$

So essentially it's a game of discrepancy, if the student gives a token almost the same probability as the teacher the correction is small, and if the gap is big the correction gets stronger, the student is being pushed toward the teacher's distribution. In practice that soft target loss gets combined with a normal hard label loss, one objective teaches the student to reproduce the teacher's opinion and the other makes sure it still learns the correct answers, and since the gradients from the soft targets shrink as the temperature grows the original formulation also scales that loss by $T^2$. In the end of the day it's a flavored SFT (Supervised Fine Tuning), except the label is not a sequence of picked tokens, the label is the teacher's entire opinion about what could come next.

Of course the student will not become an exact copy, capacity still matters, if the teacher has hundreds of billions of parameters and the student has less than one billion you can't expect it to hold the teacher's whole general intelligence. But that doesn't mean it can't become extremely good at one narrow thing, and that difference is important, because distillation doesn't necessarily copy a complete model, it can copy the part you actually care about.

## What if we don't have the dark knowledge?

Everything above assumes we can look at the teacher's full probability distribution, which is easy when we own the teacher. If we download an open weight model and run it locally we get the inference process, we can inspect its logits, its activations and basically anything the implementation lets us reach. Frontier APIs are a different story, most of them don't hand you the full distribution over the vocabulary, some expose a handful of top token logprobs and that's already very far from every logit the model produced.

The labs also got much more careful with the reasoning traces. In the good ol' days we could inspect the thinking of frontier models, you may remember it from claude code when it came out, but it was quickly removed, and what you see as a "thinking" section today is usually a filtered summary and not the exact computation that produced the answer. You probably know why by now.

So the dark knowledge is protected. Problem solved, except people just got more creative, as always.

### Distillation from reasoning traces

Suppose the teacher answers a math problem by saying something like "first calculate the area of the room by multiplying its length by its width, then subtract the area that is already covered". It gave us more than the final answer, it gave us the path that connects the question to the result, and we can collect thousands or millions of examples with the original problem, the reasoning the teacher generated and the final answer, then fine tune a smaller model on top of them. The student is no longer only learning to predict the right answer, it's learning a pattern for how to walk from the question to its answer.

This still doesn't mean the student copied the teacher's literal internal reasoning, a generated chain of thought is text, it may be a useful explanation of the behavior but it's not a transparent recording of every operation happening inside the network. For distillation though it doesn't need to be, it only needs to be useful training data.

### And what if we don't have the traces either?

Then we use the answers, and that's the surprisingly simple part. Create a good dataset of inputs, send them to the teacher, collect the best answers, filter out the bad ones and use the resulting pairs to supervise the student. That's basically SFT. The student doesn't get the distribution, doesn't get the activations and may not get the reasoning, it only sees what the teacher said, just like how we learn. Answer only distillation obviously carries less information, a picked output doesn't reveal every alternative the teacher considered and the student can end up copying the surface behavior without the same generalization, but at enough scale and with carefully selected prompts it still transfers valuable capabilities.

So notice what happened along the way. The labs closed the weights, then they closed the probabilities, then they cut down the visible reasoning traces, and the distillation still works. It got noisier, more incomplete and more expensive, but it never disappeared, because at the end of it all you only need a good set of inputs and the answers that come back.

## So what does closing the model actually protect?

Well, quite a lot to be honest. Closing the weights stops an outsider from copying the exact parameters, from running unlimited offline inference, from pruning, quantizing or fine tuning that specific model, from swapping the inference engine, from reading every activation and from ripping the provider's safeguards out of the original system. And the provider keeps control over access, it can monitor the requests, detect suspicious traffic, rate limit accounts, ban users, restrict regions, put classifiers in front of the model and change the model tomorrow without giving anyone the previous version. A model that only lives behind an API is much harder to study and reproduce than one you can pull with a single Hugging Face command.

But closing a model does not make its behavior secret. The model still has to produce useful outputs, otherwise nobody would pay to use it, and every useful answer gives away a little bit of what it knows and what it can do. So closure doesn't eliminate the extraction, it creates friction, and the real question was never whether someone can extract anything from the model, because the answer is obviously yes. The real questions are how expensive that extraction is going to be, how complete the transferred capability ends up being, how easily the provider can notice it happening, and whether building the student is still cheaper than developing those capabilities from scratch. Which makes this an economic problem at least as much as a technical one.

## Industrial scale distillation

In February 2026 Anthropic [said it had identified](https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks) industrial scale distillation campaigns run by DeepSeek, Moonshot and MiniMax, more than 16 million exchanges through around 24,000 fraudulent accounts, and the prompts were focused on the valuable stuff, coding, agentic reasoning, tool use, grading and reinforcement learning task generation. The traffic went through big proxy networks built to hide its origin and to survive having a single account banned, and Anthropic calls those things hydra clusters, which is a good name, ban one account and another grows back.

The individual prompts don't look suspicious at all, a normal developer could ask Claude to solve a programming problem or grade an answer. What makes it a campaign is the pattern at scale, thousands of coordinated accounts hitting the same narrow capabilities over and over, generating huge volumes of structured output and routing it through infrastructure designed to hide its roots.

## Cheap black market tokens

There's still an obvious question here. Frontier tokens are expensive, and some western providers restrict access from China entirely, so how the hell do you generate millions of responses under those conditions?

If you've been in computer science for a little while you already know that stopping one country from reaching another country's software is not as simple as blocking a few IP addresses, VPN's exist, foreign cloud accounts exist, stolen accounts exist, third party API routers exist, and companies can operate through subsidiaries and infrastructure spread across several regions. But the hole here is deeper than that, there's an entire grey market for frontier model access. [ChinaTalk documented](https://www.chinatalk.media/p/how-to-buy-cheap-claude-tokens-in) services selling access to Claude and other western models far below the official API price, some of them splitting flat rate consumer subscriptions across many users, others routing requests through big pools of accounts or reselling through unofficial APIs.

That market is genuinely useful for a normal developer who just wants a model that isn't available in his region. And surprisingly, it's also useful for anyone who wants to generate a massive training dataset without sending every request through one easily identifiable account. The proxy sits between the lab doing the extraction and the model provider, requests come in from many accounts, responses go back out through the proxy, the provider sees scattered traffic and the customer behind it sees one convenient API, and some of those networks mix the extraction traffic with normal customer requests so the signal gets even harder to separate. This is not a random researcher copying answers out of a chat window anymore, it's a distributed data generation pipeline, and the engineering is honestly impressive even when the whole thing is breaking some rules here and there.

## Let's take a break and do some philosophy

Now that we are out of the intuitive technicalities we can think about this cat and mice run. The big labs are trying to stop competitors from extracting capabilities that cost billions to develop, and that position is not absurd, training a frontier model is not downloading public internet text and running machine.train(), they have to collect and process the data, run the experiments, design the architecture, build the distributed training infrastructure, deal with the failures, create the post training datasets, pay the researchers and burn a crazy amount of compute. The final model is a massive investment, so if another company reproduces the most valuable parts of it by buying API access and collecting outputs, of course they're going to call that extraction.

Distillation by itself is not stealing, a company distilling its own model is normal and a researcher using a teacher under a license that allows training on generated data is doing nothing wrong. The conflict shows up when a competitor hides its identity, breaks the access restrictions and extracts outputs specifically to reproduce commercial capabilities.

But there's another side to this. Frontier models are becoming general purpose intellectual infrastructure, they are not entertainment products, they touch software, science, education, medicine, security and our access to knowledge itself, and if only a few companies can inspect, modify and deploy the strongest ones then those companies get an absurd amount of control over what everyone else is allowed to build. The public gets a rented interface, the provider picks the price, the permitted countries, the restricted domains, whether your prompt reaches the strongest model or a weaker fallback, and it can swap the model tomorrow. We are becoming heavily dependent on a few companies.

So is unauthorized distillation simply theft, or are the open model people some kind of token Robin Hood taking capabilities from the rich labs and handing them back to everyone? Reality is not that clean. Calling every distillation attack heroic ignores what it cost to build the teacher, and calling every attempt to reproduce a behavior theft ignores that knowledge has always spread through imitation, competition and reverse engineering. Both sides have an economic interest and both of them wrap that interest in moral language, the labs talk about security, intellectual property and national security, the open model community talks about democratization, research freedom and public benefit, and sometimes both are telling the truth and sometimes they're just protecting their market position. Normally it's a mixture of the two.

But, even if we talk about only security purposes, we are not this naive to think that friction will not make people go to unregulated markets, right? And nation states developing their own chips and frontier models is just a matter of time. So, removing the access from everyone and creating a huge friction to information is really the best thing to do here?
Are we this naive to think that a threat actor will stop after simply being blocked from accessing a model?
The thing is, removing the weapon that many good people will use for a morally good objective, because of the threat of a small sub group of adversaries is not a good reasoning at all. The world is not a beautiful place, bad people exist, and if we remove the way to defend ourselves from those people out of fear from the unknown and inevitable propagation of AI models, we are only making it take longer, and the final result will not be something beautiful to see.

## The frontier is quietly closing

There are still important open releases, Google put out [Gemma 4](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/) as a family of open models built to run on local hardware, so the small and medium ones keep coming. But look at the top of the stack, what was the last time we saw a big frontier lab opening its best model? Alibaba moved Qwen3.7 Max and Plus to API only with no weights to download, right after [the people who built Qwen walked out the door](https://venturebeat.com/technology/did-alibaba-just-kneecap-its-powerful-qwen-ai-team-key-figures-depart-in). Gladly, Kimi K3 got its open weight release and a [paper](https://github.com/MoonshotAI/Kimi-K3/blob/main/k3_tech_report.pdf) explaining its architecture and training processes, i guess there are still people fighting this outside, right?

I don't think there are only two possible worlds here, either the weights go to everyone immediately or a small group of approved people gets through the gate. There's a lot of room in between, labs can delay the weight releases, ship smaller versions, create researcher access programs, separate the dangerous domain capabilities from ordinary access, publish the training details without publishing every artifact, or just open the previous frontier generation once the next one is ready. But a world where the best intelligence is permanently rented from three or four american companies is not a future i find particularly exciting.

The core problem with AI right now is that it's taking too long to diffuse into other areas of human knowledge. The race today is for the best coding model, the best agent, the best enterprise product, and the other sciences get whatever falls out of that race and work with it. And even when a model technically supports scientific or educational work, the token price gates people by simple economics, a rich company runs ten million experiments and an independent researcher cannot, a large lab generates an enormous synthetic dataset and a student gets a rate limit error. Of course, good models means a lot of VRAM to use, but the race is essentially who has the biggest model. Yes, the bitter lesson applies for general models, but the price for compute is not decreasing and with this geopolitical race and chip exclusivity, the prices will still take a long time to stop increasing, imagine the time for it to get cheaper (if it will ever happen).

## Closing the door doesn't stop the knowledge from leaving

So this stays a cat and mice run. The labs will build better classifiers, stronger identity checks, behavioral fingerprints and stricter access controls, and the extraction pipelines will spread the traffic wider, diversify the prompts, hide behind unofficial routers and get harder to tell apart from a normal customer. Maybe the defenders win some rounds and maybe the extractors win others. But open source was born from exactly this kind of problem, a small group controls something useful, everyone else gets tired of asking permission, and eventually somebody builds the alternative. I don't believe AI will be the technology that ends that cycle.

A competitor doesn't need to rebuild the teacher neuron by neuron, it may only need the coding ability, the grading behavior, the tool use pattern or the reasoning style that made the teacher economically valuable in the first place. Closing the model protects the machinery. The capability will still walk out the front door.
