// DOM half of concepts/haunted-forest-walk-v3.html (Phase 3b-2). Pairs with forestGen.js (the pure half).
// createForestScene({ doc, root, forest, walk }) builds v3's #stage/#rig/#cam structure inside `root`,
// owns two <style> elements in doc.head (the v3 CSS, and the per-walk keyframes) and removes both on
// dispose(). Ported from v3 lines ~27-72 (CSS) and ~571-699 (static layers, mount, build, render,
// setCreep, advance, jump). Time is CSS animations plus chained setTimeout only: no rAF, no canvas.
//
// Differences from v3, all forced by living inside a React app next to other worlds:
// - ids become classes (fs-stage, fs-rig, fs-cam, ...) and keyframe names get an fs- prefix, so two
//   instances, or the clone used for cuts, never fight over ids or global names.
// - v3's advance()/jump() station bookkeeping and their "drop while walking" guard are gone: the station
//   camera (lib/stationCamera.js) owns the station and calls startWalk / renderRest / cutTo.
// - startWalk only walks a FORWARD single step (v3 has no backward walk). Any other step (turn(-1))
//   becomes the covered cut, so the scene never walks forward and then pops to the station behind.
// - cutTo is new (spec 2.1, queuePolicy 'retarget'): the v3 reduced-motion clone-and-fade, with the
//   clone frozen at its current animation state.
// - debug-only v3 bits (#q, #safe, far30, the rm checkbox, URL hash, legend) are not ported.

const RM_QUERY = '(prefers-reduced-motion: reduce)'
const FADE_MS = 450 // v3: the 400 ms opacity transition on .rmx, clone removed at 450

const GRAIN = 'iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAAAAAB5Gfe6AABOa0lEQVR42lWdi5UkOY4EU1nIABkoA5TtSroZmP127nanuz6REQwScPjnU9Vnus/pmjNT/fef6e9/3785f3/698fn7w/6+yV///X3T//94bl/9veV9ffn36/6ftnf//p+3dTfX94//P7B+fvn7+f8/ay/f++Z+fvX7//+fuvfb/j78+/vrPv3f990/9ffD/37ur9/+/tJ5/7Kv6v8+1/3R/79sPsrv39a33+9v+bvx9a5l/79+7+f/vdTKhf/92/fX5//uz/pfpTv332+H6POvQvfi//+1u/HzVV9f0R+8P0Ifz/u3J9+/zZfWvcHfC/l3L//fsG5H36+n/37kb8/Phd2f9T9kPfTfj/89/Pez/L9FCcXMnM/xb3H93PP9xHl/937ff/zfTb3sr/f9fcbvtf195/vP9/HVPcJNvc8F/L3v3he873Y7w/4zP0l35/+/eL7cL7X8v1594d/r+/7X/eh5iHdOz/33uRX3580ufL7fedexvDBv/fjexP6/t77M/t7Sd/V8/25lf/d3+f1XT6dizz38X5/4N/P6u7cuu83fy+g86Xfz/X9wmJpfK/j+4m/F3mf6bn//y7cyUK9f/+9/vnex8/9qMUayQXf5fe9WH7rya/8fkdn5X+vadqnlMVady1X5wffX1D3pbmv1v0tdwl+f3tn2d33Lnfu3I+aBXZ/312GnZfj+1Xf3/C9cXU/2H337pLNxy8v6nufs4bvfzUf4v70+zLeZz8nq/rv+z53kWUFzV2UeY9yBX0fJn87POe56+ouvL7vxV1h94nfleGGcr/33PU5JyvmXsNdF9/bcG/C+M+91efuOrzy594TlvH3Q94VNnN4/N8L6fvafe9w+RrdhX7X/P3qPPgsjfte3L/8Lst7iz99r/Tc589rf7edXMl3udxt5G5Ee0vuEr5P5f7C/My7rO+qvs/4LsQ8+OyFuZL2Xco2dW8Ef3A/jHeps9C/z75307q7W+cx5SHcJcn+PSyUeyH3j743MVd53+aTr8g+WFmkn/t5vl94n9zdaO4un0d/v/Yu+7uX3s998mPvU8oH7skmfb+83BHzL/e2H76apZQT5/tK972mw7Mptpa7b7Bk75K5l50X+q7Qu4/mAOns8yfPqnKdd4e9S6jvg74r/rtess3dzeb7N39/98n/uCfSvfashO+Tves7G0he3rPbOLvpudth37//ror7o+revZyLnQ8webb3l87dtu6PY2llg7kLo3n98hKPX5UH1nf3ui9GDuTDevV8/S7zetsfp3JVdrXKObLf1znHP3mE93iZHDvZoO8vmhwu2auzL9x7cs+fe3E54POC83J878Xdy7NB3L3zPvasoRyu9+vy1hze31sv5HDKtfSwoeX1aF6ru0fmk7HS+26e7Q6Vj3j/61T2svEMuGXKXbl3f66/U+BeWnGw5fvu2d9ZTb4At3Dp3EnWx11HKYnurjJ5SfLaZB+arJfKY7vPPpVQdsd72yfbdeVsv9VLHuHd2+/r745zN+icJncz4jTPlp8HnTOXBXoPnfsgsqA48POJc8h+UsLlTLnP5H7PPcuyMfMunKyu/WX3iVZ+33BIVM67+/X5JXfzum+C5cR9K9iEc4Z1Hvj9wnyaw4otD0OrrMmvr5QTbjp3k91X7X6Cw5/1PSPYayaLde4uRY1zPrfCvRuL190p/vqe0PeXpqa5jzgfKRVfPs594fvuS3minZO0U2oe3qDOg051kJ0q19++7tlm7s6UsyTPMFvHyd1PVZgHvG9EZelmt8zlWF1lQ+ycFvnYOVhSLP99zyf38lZKfGU262YJU8ne9+quxuwgRT17F9Jd382/Dhvs/Zx5iTqlb17FYVtJjZYXLBXevR33ZcwHzCHSzUnPTTtpVu6BeTxSuAe0B7lzJ31NKr+UTJNS7+5UOa7+ToFJYXjP1eyIqSx5xe+94Qg9WdTZpXLBHPqVWrKzG+zRx+vnFmElmgbhpL+Zpu3JVVCyVnbYoTC6e33qqxwoqYj4w6y+nLn341m3pm1qinA2WCv+lFGfu0TuZxseP/v2fWHvhdIMNqXZHHbi7P3ZafMrKGrvJefO3gOl7Q3y11ma9fO07rffGimle7PsJ5/V5pMKIWffbQ3u4chXDv1cyudsV1lVKSbrrqjc2cpG9ffjPnlpU2XR7d5b20VV2dkHPLKzEXfKfV7xkyYoZ3hetqzevOd5bVIgc/pQ8hdPJXeI3jerIydjDkGK5MltSm9dh8I3F37yvM+0Rfd9RW7/VPmBd0PqPAKW898n+Ry6mmEjuYdymqhut/37ienhvZK7490Xr1Ng0GKlm8jfpUpO55KVk5rY1jY1y10Hd03fJ9u5H7Zo7rrp0+g4izMp50en8M8hll0xx0oK65yl5/hSZF87OSQ+la4sJT77ez5hpeCka80OkYP/Hgw5b+8CTe102GruJsmrTAUcPOGwdu9aTeMQZCRdRHa4dPWsgbLEYl/J0kx7UK7c++hO+o2AI8Onvet4xks5LO3s4mng+pP9rZqLSXFCJ5RdKW9fjqm74HOE8MLRqFBZgjvk7M1Hy4PIFdIvUaelgsqJNPnhDd6RHf3QKTbn4Tlv/WbtVLPvNOeqWEyglfvhs+sDydz3Jcdsbu0n20gwimKXKw6jHBunPWkmR1AWcPpc8SPrxqBA90nWnk0s3GA1hwU56ccpa/P61CId9k35VRTzk126Asml/87b39SJVMM85/stKRxyKlY6/xnLjC8kdm9PNgFAgluGp7PtFP3c6ROwg65x0qfeV2zSS6RcuLs4jU22sVtagj7SCfLuBllLYT9BO05eJ6tu3pZb4GUzLy5vFg9L+067FLDmvNNu0gpQu96XMZjh9wd88pgmOFua4lTsh0Ls3pdKy5vPO8fzNXVOznL6/3zZgobZ+Fit2ZV5FPZJlR+WosL3wr2/yxeweSOGXRNgMjVaVidwVKpefnPKiZzmxS7XOeTzqD8nJ5y35v758BT78KwPd3Cytu69yXINopwCZ2zgs19zWPC3tx2i1BdLC4BltXbvGAhuB1go0JyAEfeiOMkEJ9lo2W5LPCvdpFXIOfQdabWbDvb+0SeVdwfNys6RNqLpB7KX3CeQw/kdNK8TSg9gF1g2CQDHldP3dnIn52VO2grGkK5/9my920fKnwJdTV+Y/jfFYGqpyoE02bUDXU0QMGCi3qY5hXIHFMs2VH+nQO/tTyFRHPlC5AH0sp1n5wXJGFZXBgLU1zaSAJW8SO0x1LSCbduR55UzCfzh0I3mnLrvTDredL/pH3gQvBGpF9I3BAM/bDmzOxIlUXbz3LXv0/iwpw6dEl0vp0S+UUA4NU2nceS1YgICTnIvGFTJFX/XSVrau8bcqtIspDH5aaa7QRA8we4d2aor4Om9kwMQB0K7eEYeS7oCapDJDjS2Q6kd7o77aeYvqfHy5FNRV8Yt998tKrMRpGJxi82LBvp/yuKlU+5SsAXkLzD1zJI4U36XQHMS321rGP4E+ZgccrYm/NsEfk6PNeNOzbMChwjsysdgl7d6+sxeZg6tvLr0nPlAC8/wHClUgdhoLodeheHY4RZnnwxSkV9QqRkB1RqAlelZRjANLJ0itstTjFY8B2IAizSEucnl+Ielm98fMMtqJn2V07vJYCSr9u62WVi+54ClOY06t/hw8DIFascsuaXpntLeBmHMmglucl+fEe/O65olnM1maBmzSDMcCLx1f7GjvqzlHLF+ttxZoN4Kipaa9+yJmJNalIzF9xG8undIPDrrlP068HYKoW2kUzXmkNtRzX2HmWVS1GUZnNmjBCwkZ2zv7CgY+6KqeWc4QJu77G7LFhloqT3RDtAQwHg7fjx2mA1um+r1cMZ/8jNSG+bpnHmnGcO7YOGpHW8xl46donsAQtmX00EXG0gdB0M0osfB26tji67gPoqAPAB+gs8pDdIueg9ODoFhfwo+lEWRqU82YguQ7GN9dve61/0djJxMJPKq5T0LelyeYWnBaFA4ttOUbG3BSZUTO0VzRuOp7zlgmLwE08jrHHBLuIdqha64GHFbRPQBRnJ0kfuef035m1UZ2O/2jXRaw/DTs7nBvebTGZpRt+ZK/KK7fvNMMyus9rzt+el2eJ+ZaNDM5sjP8d2A9gfuwREAL87QETlfXGhsc3P7nb7lhpYQxgIRwR6LEQptWibmgZ/vFWTUQCMTzOMzoColjkbx9KYTwR9/pr3Zkzl2c5vvXxZlGCA9/UVeGcbYA/hxet9oUfa8rM6Ph+HEGfHuFCZUTyJlgQXYP8tJLXMjTng7K8r2YwV6n9nfKVDZnDNlTbdAY5G9NpjKEYi6G35m6DsU7fkZ0rOFAHnlfM5+2Xx12lvAkDrHYdIOyW8/fni1mwP5HlrggE3VymQSIJ2WYRyMsjEF8LAcDVWEumW+gxHGqoEInCdku86x0cxCWIiLphzGEHV88wLeZpKdOWD6fYYyeV+panMQhDSQBsdtIyVLXut0zQFXFqvJKcssy32whdJTk+RlYrDKR272HUYhWb2ftmo+JfUis7+85T2W5Nn7DmMO1/ZhNuUMvqlGsqeC7NGxNYN7PiJFCzhWigypLT4sgOWzT/Dwi9Nwd0axTQ+d/iDzmNmjZRypjqAGh+TdeD6MkUIzSv2QIr6hqDAEDDYmQYj+LPh3aqaQHTLoSMXNWddjn50OtF0DnAQnzcj5YX6kKU4TweiT5hywplnyS0ZqZjXptPlBTvuHod8yGJh0fK/yU868Tv6TrWmxae/FLCJNP8KoN6eu0MZsJbbkEcYaQfJz852NzXApgYEy08gM5TAjCriWMjtVbUEuexU+LYMgwPZteXv6LGh+sqfRIVI3foC/qcIDB6b2aYgcHPgNKEEpwZmc/XbBqlS5VP8DY0y8ejylgP2EFZnxscvxJ9lTeKzwwHq7GB5KUXhI45IWtlOQGQZeDPcD3jrL+H7vp6iinH5zTjOaXZ4IQ+aG2ZR6Ip821QGlUQo3BkMpcXN8AZGVsAhXeoBXnHycHTctsyYDlMAj8pMoJxinOFMPI625kGIZj/Q/MTUWYW7u53D3gW7d/gNiCmpWO2eDwWitN947jnyoQHROGWoWlWrqcMcj+ddlZhbLcHYR8dfueDv5B27NrLEDSpW/N7UHE7m8oIHy6cwsZN+w51PlxpJuivnmwGRz9jIORVNvnrQ9drwcVrWPlVdqKYtOY1KI7MP3hubWQIVys2Obz5tAWw32MPBL8j5mGy7e0VuKF90k0ErNwgvFgJfhWH0OfWYm10wFKZ/onVLNB7bN7s4A8fVCteygjP3ym23mTzpWivSMtVL7vmKhoTQBHeXrwlxhSHR406S1pdrefWI8tbLnt8ObFKkFRgxwNGyfdzASmHjEeWnLl586VkTdlupwCn0rUw0HzszHeO1tgCTO2j5OC8Gf3MmKRSkJBkJbWxbDhc0QR1JnuuWw26TwVi08EPgzHyw9TrY+Zq6M776DERiVjm9kQW7JDPbJrMpOSXA/UJGHdtYbKNxZrsnhKWQMcM4rGRbTfJt0VvGIcCxxwlkOo1dGRe51DLig1YLApGU6HHotSVuC8neJfvIBSmYgJBLm5Utptcz2tjY0K3727OY3DorSfQRszhmQQtkWzZ50hJ52NdiqFZzpHKCpiXI8bDMTYgzliqTGsqZjrgdZhL4drsGI/33yHoPwz85rc3nZomA9wB6gAss+TKHlZOOcxXM5riAtBesqG8x0IyF4AsGmt+ItovrPxpgyFNZFOxCjAesQ1jqlKljAorPtKdqivrfKYlZw//azXxaiEC1Afn7xvW/BMnxu+a1hqhxHUROo1y3qyPfPvjaUYGfL6hRS6e9lNHJgFQO+bOZZSdY/S+gBck/3Nva0gLnlDAWYIGfE8HaGAf4djJzA68DLDR4jrf04ns9KLF4ISfr285zZy+Qr0VFrEpmdzDbzFmWRDiz/9LS5bZNioyQEZV4McTyLNxhlLa0vmxo8kYLAWkDLw9PKlLnFTb8MESZlJb80NTjdLHOhYGTU1zsjA8AcGEsFqBLkr5ni5f/CWTksiiwrAE/g+kaDkNpiOeJIKlrerDKBcv4q2yWHeMnimX15x4EExOs07We8/g8t6VmOuWO3kqyHlALKDxBvhjBQRlm71NnjfNUJPxR3eKTv3YYTzOAqF5JroIgBKU0PynUzdFnSTSgVA/LCp6Er35fMyScoT06xcJ4+42iHoo3ziH5qtpTfVwxY6TiPVPJx5M4VQ/TwH0EYczpRiJypJSulOA5olXfgDK899AvKiqyjtwY7T11MZFAYFJPp7cUzQMnMlVqg5IWf72Dk7IYLMQ+aFHVOL3stY5yDJqGPWKLsx+PuSTfXkk9Sy0HSc76akwtgYhlREI8CeMMZ5WOzK94iBrBhOCmpKRuphKUGMN3uULT4qZoZN54P9ImzVW+Wta97CJaBAcYmOGV5dlFA8rzmTpjysxbVPZK2z242OfEQk8FxPCLrICx5dQsCkLuQLc4brmbvBxrLSWl/mD2yGZE0pVSjlPv+/08YjqNCrlAAMd2XFnp2/Ap33b4UxiBfSx9n98bwWlJJ+cOZULCNBYHvDD44z5kzL0OK+i9Ij/vtOMEAyAXDL+tC96TsKZzxDvkH4OwTJnojcsn3ygXxxYaNwiwidQ14rFOvjALkZmc3ZqYP2iVYHOyIiXG7JluG1im3oOHggkB+9tRwIB6ej52Ar3vwzsUHUi0Bx4W5kSFsQOq/UyAXrRYFTRbNMcBoqWZihNE/y4Yj6SymxBb5MIjDa5wbeaSr/dwxmgu6UV5adFMOdsJbKvWJ4GShONYScxydMJupna77trU3Ry7AJ03X7RyjDRmq3oWh07+m2h+4d8PW0Lvj2kKAffMmZE29IW23cGbG1TadSAJzC3ZqMKFqpu0FM43ahGpQOFlOL3M9LhVuPiU9s6zxRMrWdgcjPp/Mfgti+lk28jDL+ZEUMNMAFmtIYKiLXlEOewdOkmqYtlqgrTt+28BshJC/aOthkgr1H+r3o/3BWm0h71pJa/ZquAFHRcMPWPodjJRkZrq6oIoUo8tMle81EqU6VFwLhjSfQHIpoAbGtEVvTu4w6grAoLKEnbeMTIGiGCyrLaBNxvwFw4et81ANNbe7QeH4zam2j6j8AR+5m8GnF7ZAkQBHU5mfWoDUuABvJ+0hPxi1YP49BEXoBBl2w82rFcWKl0hwBdeUjTW9xEEZXRmaRZ5X9AmuZBQ7VOWUEyltT5Cns+XjgcwIfjt3MEKHKiAMNe2sugoJzPEdBMmlfypuyRmVDvmHqV+pWAHob+Xo9s7cToqj4fBQYSO5Khv4MGdm4MsBB9eYetTSGVFmKo53IapDW8r7x5epLEPH5k/9nfRTRoPtLgr6EZLXtIieJ4zLcMWzh6MJ6hd92kGYMeKeFQxSQshRE3ycewnJNaVbHkGqtlphELKSeiK8zAms+eHhf9niogaW6giYGYmsaKOluwExwGqXg9zMLSLjamRY8ttHwiE98/Fccq/OK0XvxxFhaRnMVmFFahxlQmVhbScB3jRMJ3mHhoEhve2iLXcw4ha/iIejfSSZP+oBJAGKxx1Kq5I40vl9muAZQX9WmHPGkehxfs4mlM77Xch5grVazrsb3TgzhC6hgDUCEt4x1Z2R2PbO0vPWfMfjOc3UFKtoPYwcg4oUaO/QwZXUMoaiUoOD4ZVVdzYdSGJQ6SSu9Y+y9uymABy+d3R+WL68YGwS+dXA8G8Qk7XNlIwjKN2Tw36wPOG181GveVRGsvzEr/bfeEOACnKungxDc8Zgl1HKksvxH2zCeSYbzZzUH6+QiCYtpZ9t/HbZoZDk2Freey4oL2DDrxhP/3Ne/4YiLKtrdo/9RKZNh3zgq6IEFxk7LR8unXpBMS/GNP7K6GV4ZgyxrG/OykuWyo0IuTFHyJfmEMLmQ1VgFo+UAwhn1rlPvCiCk2aR9ZlN2hqSujnvyjVQKIdKWWcH1loKQA0s6LHyEgbFcSyagU1JIFC4Csm1IY6njswsJmMCySyOu7jRDswBGaCF8YYx668jUzOzK3lLjv+PpJwcHu0wCCUahyxb8yd47Xk1agvqr01IraSKOSvzCFeJhgW9olBtZJxRRUccve9R13hKHQsE5UDo5QuDgCWSkYFFoK7tnBWrCvQs/Mxhm2oqhep/RJcaDTXueFzx8DmP386EYbwb6o4PZW9BUopwAcYcxJhB5g/lHrg9TgRV9p45IyG97YbN4BH5DrpHiasRiJRsFbf7vIbsaggSU0wHqmDOl+rniOenlvgaKITtwLACJmTYDtZbmLIU6BKHeMNMw6DiSDEuHXtUtBfSoj1ulMdQZSGekGPEXrYuOVl80EgYYDzTgbGbZvwrgKu1A+WeXgwH6m/Qj1uwflBMzrg3DqxMWSfPFygbgI4WhzIP5SAt1OBLlNmG+mVO/92JGsIoiOM49pVo3CP0P7aoSvtLYDrnQ6/+HoZudtBsz6BQjyGc1pI+OmTAD0cP/LFsnDJl4XYGQkjbvk40R16SisFRKJEClXoHKQWKmLNmQWX1JcSfchD+nfstrKPVvb2hoMU15jFnbWJ652bnCBt58iF0UCc6MVBgfqP+BpLw9jo8xVLTwJJOJZeaNxoNNcsHG4xskrVeRkJF7BOIPNIRosA/tQR6SIBnB/lZRcfzoJ2oDVNJlAXZkbNxlocNnEkOpV4MOAYKEgTSR9DEj8Nsjm+lLj8SBAWqBee0V3itgwGvZjndPWspsN4UYLpaOrjLpBM7Og9Z8njHBqXYltJHF5vgLs1n1jxAElBtre/IMYMRXBZGXxRJvpRoufEHhwvQKuZvgR5qJASEFMUoHtsSSjjmGOoZWU9Mv5jjySkr6immxuHejxRwvm/AKsKSqaXbtxJlFAo12k8VrC5bghgo0FvJlM5fgdWwWbf1BMpQzuKmOw1LhlPGesjhdy/9GOl6xsCMV+XQIKBGZcz0NGZOp9ZcbehToasxR/GH149GBBpqatPjuCCn6NhF3X8+Un4EuoeWOq1Fek9MjeDDuaUH6gInand/t/+z1kuIK/ASGSQrMsiozdAB0dVgXpOdHDcvyVa68DDCxcqnFPrN0pMs5hlQ02zIIilK+U+jeWytRXrJuiNOtqQmPC80uUL/DD6cn/FMS2BTL89LPQmKH0SZ6D3QHWGFIkbFgFReLp1+yFD85ra2Yco8a4uF04JuI6kjuR5aob6DkXfVo9gWEvzCiKA0gzT7PCoAku6Rcz9O6A+MmFoWMcTofPazYvWBeDAiw4uFAL0is8MzCliupPfhb4K2oEsngwVxBwIrR+GR2hno5w5GRIgxJQMXYm6VopSloPcT6q8p0X3kzABbQGr5tSNXXl3k0KpQ5oavwCw2O6R8HavC6rXFKGnc6duE4dM/HSZ3LYsx9QIT9F7yKgyeGCiM27jM1gEhlSq+ug62qlFSrHVc6j+cQh6+yibZcs882toWjnL9LLkbZEjJ+vLUyubtrL+hEItmBUv0BROS7QQZpDk+Kc6xsriH84f7sX5UeTmPFI4Vvlho6Wo1GEkqCkhLJ9l9RK7z5QNysbWWPCN5lgGzz6yxDmCGvGnkQYpYe2m8z1iQqeh553/pwVdaXgUkqmVcfBkijEoOkJpTzGGW7CpqOOcjD4ayYguO07g0UgHyepTzr+U/SVJcGxbu9crkqWVKYKd+rTXqrAvK6DEAdg4S06OXpzOruNYcbL/cFZilfUDYXPOluBaPhdIbAMYX9q1rkwqXQIrcKPNhwCLVamRz6V+qCkQyJnNNOkKYSvWmsvREp2QkaMnEy88WzDAMOQ78VM45MNF16gyZ7HM0dsRBDqg3nbWNBczFAkhAJbLg6mLhmGGEQpiDHQ8sCaqtlcnUto0/NjKZPSIYiUSCYaY13dkZMm/AD626nXtu+YcaZCwnWjMJ6ZbzCWBaUjVYDEsq+FWqooAq6r/MmGxGMTiFa18y2vKJu1cKa3mnUW02mdoejTHj0SrYZp7pfcFo1zzveUSOM2gMYLQNQQEv00uZudD2JxWmwlrYKpC0wmNo1p2WDoXGH5HVksgbEzvhHtbZU7dN6X9Hd8nZ5hgSwfgAekFBqVEod34oNVOLejlBBMFfGokPAnjqEXa4pnzHB1sclHPAGnV+bEigXpxlnYqT5xjGj3ZF9eVBePaSpQSNpHXYb1Zp2IqNtkIDZ3KcJHS6g9Km5PmEYJHMiUqLKnC2SleN4KgjC7z7+8k/iod+Z06yIuxybJTPir4k0LfgoUYx7fxw4LEV51QxCME+cnmDcDfhTZ7zdOKZtLao6uw23fNjRdy2TcMXYTkjS546hgnnrC8yGFl/Sg/n0aXmaKm21q3UCnhXPWJb+qf1mQjrItAiVCkIVqO1ziJRebhLtHdP11qS6+Cs0wMPlxcsSnvk776Ry7rgOH8/tRjxQeihMjAd4QeywE7WcjgI9XlQ67PHiFnVy+wgbOrdGy2BNP/NCz/weaDMlQDpFuYIp1BOtrp+a4h+nmDnx/drazuJePrQqIPdKUlrjUA/mAfw+RF/oIfEmhnu5Vph4l6BexnTHx2DS/7uElQeueVov41xhLw0rKpXM6DYvzCsxLl1oFU1t1OJD9zMHMYrp8uNKu3faw2QzxKLF4PCXd6pcEmxqXWwe55nDLIYexa76Gkb3GDWtDD4Jr/2gHoU9r/IKQwzVWQHjt1Rx+7MmCOBoqp6bamVIqgQR+yPJXuJNb2qOL2u3jghfH0wTufTnBUp9a6LQYc+llzaNChFdqW2AmWgIOqfY0e9pnc0H9hGsS8f2Cm9JCuc7Utbm9mxqxDPD7ZUkj+6dYtpO6uHXnBRbQ9zByNNKZc3mkk5eJAcuQYqZ2oEAAgysAKnV5jJnJEeiT0BFHRcmMCU8lR6qUT2fbZ+a0FjxWMlsC93aec9wjilUVTA17OELCzN0w19f+Dn0TdGkjHSYMbN7XBekFenctxJYL0Do9HHMpvFmJMJCF6QVH7YawYX6B9fqnV3n930epWetbyxHHK4LsBNPOtt+brJwpNwrQ1mniSuLlt8Bd9yOtn7GwmhZkkHhhTSBGxda5vg497oTFl3EFQXSIeg5B1ZJ7Xz6OWp0mNsp770J2p4KaAaL0Jwcmq41uJoZLKwdIYH6AY4/lAWtuSU1F9iD82D9leUI6R15FrfH8eBR5bjLBHfMiUl46yj/ipY5oeoW61xPgy+mVq09IjgYife676EmepZ5SEzKzyoQtiwyG4FLddZmgmtk/DTr4uq1QseHGLX/mCTC2RQs8Wh34fciSbqKBc8ui6ML5EWc/B9mLYTcuGenxmXbtsNaWYzW3QKyJdCRahnL4Un9uHpZSyEyesnX7OMpdQADZ1Lk2nPZ32xeTSy9VfId7SPwM/0OJuv1yZiNhsD+5fLUa01KHEJgk+j3AWSgj+3nXVSGsHVYaPQY5U9EI/P0A70jbq/4yNSiBejsnlBbCi8IAzHgvSsnQqdtDRjKJI7V4KzPcq4uyS+zEPxVuajgG5gPI2aS3xX+mneFhrC2C1MBI5gfYnTGZL/ofcKbEH0Rp+RkXt0SyjJL+u1YB8NoZquiOLXIIbRUXvcTGg/PO6ldmssaNGaLXllkE5DONugBGrEvN1JGT8w60FREDQeD1VJSy8u0C9pJ/P5DxzeNILMZ0Z6Ki5KSz7wE2eFV4mcY8FytD/DQ4HztEROl1umB2KyEgaIenecTXOKbQdyFpQ3P7jMSDaBOzK+7AIMrZ0/CnqIUf1jrvtZQ410U3mzAiOsjzVkH1j9eQR6gRWI7PPu1N0581/TqMrPdjSQHqQZsAZFzAQyB+8V02uOlB+yRZyD1fLkCmc7OkX1lgIyS0i0yrhP6KMov/X5E5pzrFsLkGJljaLxMJ3FMOys1v7sbSzg5R4FIDzadE47AQwoPzq0WJBkC1A9wxceOE4eOWtqgk3sUcyvuftCWGszpgnmXWqfcYwNBcekifWD26L+uDLKeC5gjHHwVs5ulI+DIbGXLrFl7dDbQmrK09fRt5E9eQTC9fLo1jt95qlmSue5xZxU9M0L98DBb5T4fiS+HArE8TMIJe9zIkwKC4dHZ6qVy7eMihzDRoScx6qQgfFamSP6iCnAvhTOqSwGywQhOdHZ8gkvcxdufFiOfIh1wBIUW7+w6FQ/muCdPYuhk/am1Ljo8QHVnJ25EY6uJfnHAAIUe2d+lHd2SNqrrOsRC1axnTlLjIJmfn670UNrwjFWVEq0EfjiXIhfzvMF1bA6hMmPhiA6JGd0Z+xMe3Od/zJIXAbMrB2cMw82nXo8Oi0U2VVr/VlX8CqnBAKC86vFgGGfhbuRm7xRRL6USlNTzgGoNE0Lu48EmQAE97l9jr8KTs7oO0OrOk43Wx8FX6ICKSln+TS7mtv0crORoG2W0FNGL1UqFQ4LebSh2ZSlHzfDcONHmepGuPQGeRktsHu4NCzMqRiShqX4ITNvHhi7qpeSvr+1XuyD9GScs03beRFHq/mseRRytkMj7JA49lKmoQcXwCYrEoK81Ez3EGY0cnTLvv88gczOmh3TbfDDjMVVXr3PkZEoDULyrb7ux6AvSj3ATPDHMvHDkezqBbUZwZFEtp420UEzD0XQ6HHUO2tvJZtVVrJbFui7sDV8K8LYCDx3XmzVYTlCLEALMDdjZDbckv4mN1d2o7a+Z+VNEPOKYAmif/LZSeXEnd2srdSRtUXu0RBu/QCxPkiN7kxmvSLLd7CXWQGsgFZDL2Pg6FLnw5jDF/XpCMbwhDsYYaujnD39I2NzKAcEtYQzFAVrm0dfNyoBer3OC60SpRuD1k0OfLyqUvGK9xevjV54KL7Rqh9Ox+ptlncszmR6eWaiIow+NEhFdPf5FYmc9ZN6duX1nCOsmZ9dPEyoehmaK4aqY9onSEEcvgwcKpWgkJkAXKFCZndUoHfUdpZNeT/f5H4xsUZZoEdmAmF+bD1C0mhn19/BSFuyw4MDgazFBTbwaJ00UXCtRacFyVHEQYka6ghUjG2tdhTYGoQD07KqtgeGpE4sy2yC249fHMox1JSrRnoWeozl3qRLtx6a469ucIUtfV6uwai6hQTkXSawanT8kHu4kRbPwEHavV7qP89cTkrI0GaUqpcYrEyNdYQid6QvPS9s2a/GDT0sbRQB6jqJdxqakEVavrrBNa3SW6hWZqQjD8Ocs23B2bVoLETrsYBgRXuAI+1oJA/MSjNfGXjMsMGfiu1m1hinzI1Zc8jzXKDXYUiTMJixaBRFtGdDvHCtuQYKjIn0b8f6EyDjgWQyFlnXO3KzCiizc/2iH17b8fPWNqhnDBXo9QpJ3wxppqX8lFaCa7k1EmOoHDZYY2OVzY2zfsQpu/W+HGliN2PkQfKtnkCA7fw4OUIT/pnZbjKcb4jJCMQDjU5AIuzm2UL053WWY1aPGK7LmNBwaUYGFL4CHy2dd8HqyAl1Dwp8yUGpNbka7Yo+P+IUVKKpF1tD5baW0ambqLBHwFrNJEpRdR30G06Z044MBGNv+hovADkhJzjrEbklg9lp5wVAjdAUxRSDGoX6i4G1vuurMXPX/kZuto531ORq2QzkMK9IrxIHoKrXMot0MpkhCiGy85MdE/C/NxCsF6lcnVrvYJoxGENeGS6wkl6MVlkWSh+jwE8DnD2zJHvuFu+vnhgoENbnmOKs//JjOeCJs3FsZBQfs3eW18hOdl6isk6YSLH6zZvH/CCk3/a58BrPumRpfVGtcImwELz8ysIcNH1NxfA8sq1njm3WGZaMHzRu6EeRHM3zRdTb7xxdqrFKgXydIlX5Hgf6rFzurCKljeudWT0+fd7BeG610MaNb77VWW9IUldTIp5td5iXnDevWnchI5oUBz5nxhgo8FbOWWEb3aUMeUwKR196Y7Ks/Ed61tEaUznVWVYY1okvd8BQ0bcIjLD4cQk4BtitnVGOMvYpzM9EnA+Uz7PCrFUHoIoy7UaFwjVQ6JVhL7V92nyto2IZDVXxgcoMG+FEAmJ+HSPMogHBoE97GQ1UNnYGgSK1gu+dS52z5gEF4ySbJjzM/nFKmzXOqs1bnRU3/ID3DgIng5HeXNfNUuHaFqLGnNKkklXI5Fuhq8DrJXfqrAUGutMNSgfGXHP2gM4bXdu6wdFeISV6oFxt4d6kLDOdeuybQyh6bbrvxjhrAk71+/FPnRzQlOODEHDBpMeHDflC4SI5YBZAZAhbCS45SyzTCLMsWGZp6sKpe7qzXVC26mgIwa7wRsUmGZZP68v069C8NjQ29F0/L3cGIy7g8FgPESYjS/NwKhjnkNnkrLoo5ZFY6tRTnCAkmnUI0C6u31DM0ahqQIReenLQBiFfNB0BHwn6FyMe8DgQjpwl4GziOJp3CIf39f24h5GxQwfbRiFb+U4/C+ez2V0wq1u//La3cdpxsHKjH5sfR9DzlExKaC2djraz5yc4B3ts8MMyqR0ziyNcccjDmQ1slxjaOB/9VC43Y+SsSWc2PgcNh/AWWaW8iG6UZbaRIsyjqkAiLaGFoDNnwzAeokSiFuSJdYFZI/ydLKzBtEQSHNhJ71ld+1mZ60+O9vnZiKDq63/85QluLHXhnbAezuqsy2wEetGdLRT2hZ6j55m8quf60YKtMshUZRr1kq0gLWopGTPr6bY+6YqR1lgDWwSp8uWEYkZLNCJKDRc+55mGfhkiIxfkzFnfBz05px/khHAYWBXFxXHGdP6L4zEEHGOuUqfknPjAvZMEW+uzt/YDbs21zRFYmJH2ZaBZyVYfzfvJorRv0gP1UCSplr6v68cj3fnSPOQG7SPmSl7pAtMb0jl6BhZhT/h7QNzE0RM7rVo8BOML7KZ5N8gnMKdCLhcn0wYoi0zXeiESiEk5ubx187wzXG+xVobF34yRs3jG476F1oHHQS+7G9fmB5dQtLWUCyepxL/1OiZsp/cCOZjTLdGx16VjgckySqw3biwMuvrJnVwrSuXlWnr2rpjz45S9tuwcuV9naVJbCSpRIdI/wE8JCkFFzmmf0+qsGpYwFcfKLxb4rAFnv25YJhcp7fZGy/I1ubW2NJ/N5zvrvFeed5K/GlYIACJcQgfSZ30SSo7L57gKm4kyyQKnzJ2H9P+Ue1JGGClX/5RKK875cf/EbZvcOzMTe4dBTJQw9zprdLVuraNNiHRytp0xNnKDfauff7cZ6ZgDWiv1SirvVv6pWtqjXm1nEzYgwB6FchJI7Z4386nEnmB66ihq9tQb0/cRUV1Pc9RchFAXiIbhYxm7tk+wn8tdr4kLla6MUeK6dYHv4ywdhd9ok3ttdNADBkU5lheOu19D5moVGB3UI8czba2P1phoAEUclrbZ3vTO+uPUxvihtJRxv6n1KkD7bP66jH6y+I5cTJmVzAJ6HbDMppvzQsTuYATUn0fIkdg9Wx+LcIgyyZx/RgueGaTw2IKV8W4PVViSGAK+mWdGhnU/cSWlULkUn9QqNLFA1X/sJ7gTjoH93k96msogDmQsvL+DkV4DuPBPZxkBNu9j1FNp+6M1h6xbbd6gsshNMO8FyspZosPRm0FNL773hsyNkVPYZi9hYR3UrP2xncT1qhaRxav49NNuuh2WSqfTGYyIQnngEvjhTd8YpmU0QUMRSdqJVaE3KuYQJrC/UCImRc+jq4yjVhnJW2qSHdi0bwgOONbE+GswWcl4ttZL+sjJHivEWhEHvN47GKn1XcBqCOhx80E1BsSeby0pR+OxZvSujcwLGQzZIWjwE4vRR4sY94/fnQ7n1Aw4eETrNUt40OgrYwbGb0dO/Oyqx5RvVn09xA50SU3+CEky8NVB8Qfi3KQ6L0V4pM5LNlr+nQ7KwQ4YmP4EvamYxJBTqfQRMtxvPM8Vdvngy1C2S8b7d93xm6NAo6JyAONMKeOgWXu8OxhprddbO+rt5V7POj9KiNozPZMGqodwAjWgOV43RvZrBZN99CdsmoO0FZeWrnbGsawPazu/MV4aqqkGsoPRxSaYm2JXzJrQPR3Oo2ugEC47BSVw7jyf5dMr+DI+hB6HpMUyhm0hH22O4HqqVjXosc8OZymkAF7Phhbzmrb7Kr6oakN00sb0qExH0o1xs7+edQXV0YpgU9h0BiO1WS3H0N/99uoNCxcr5hrYY00ZUoO/w2IcSHYmNfPDgu2XAjuS/5l20ClZ+K3TwpHDWYtzNF66tVmblNH5HGuPiGvBPEOKNVv9DkbWG4WRqF5ky59FWNbW1atUxSijNeuSDqLuG/tepZLzG19YqriWl+YkfUihMs6xnDWLfbQRKrOOJrrjM/aAarjpIWhNBqxnFlz7DkaOHBGi9Y5B10ptkOv2dsGzKUC1EkKFSF1a2LD/i67g+bTZSBjhMGXaRe292eGJ1jZQX5lAz+Z89H/TNe/VMVmAMSF+eVJSdZc+cZZuocvRpfKsdbf0F1RxLyfC/R7Vbb/ZoVK4I7rUP1LYUptnp4b781LQz2tL+7HZtC3r52ulTvN3HJ4x0zPx85UUKvoh+5md9YHtu1Zb7fOoDW+V7TQ/cXGz/hCccIeEoalHiWGGBmlBV37ZwZB4StcuqcFoPc7zXyJAY9OKyQPRpXgzWc+mDqoAqyP4J33nLGqQkvQTmPesO+roqlabIDmtF7MtzIrKkEUAzKbL2DRAUN3RmqQ3BR6LI8o6xDqlM8TurW2J+rokAMazwts+j9zYoo2tlAMnh9oYPGejOInNVzfIb+Ual8k1633ZL6R1jcdGblybX6sF9YJChigO6hAJcVbIK1GGVfFjJ4/L7VEnNFAPCJ7S0np9WfFocLq12da12tnwg/AnL6W4dzzeAJCGW2zUH3kimQeAMepx+7jB6700iwCMTR3AzuO7lQUa2vvZOZxIW61/Gr6frLWM2nD0JLVseZc4gx91SaL4Zy0uVH5xlVBcz80YsZD8SQJZcuj46p55CugRRtzQdfJWptcibpaRWTvC7TdZIph2+nmiKsMlgGW9KNa/p22xgBSgX55nUKz5+FkzTMkrHD7DrAozh07GiNqGY0HmbF2StSC9pKxRiT7SGvrnMNrZGDyFtTP7SROxBZxn7UfDi8TMMOdtEImmOX6f+YsMFVimG7S9Zu69ATYMlFtXS0go38GIsEyj78qye6zE2ZH6ObJ2BNmhtuEAzyBAxdMzJ+61xlHlyItQ0sLhHJyzUbZ6NGCLWbVKFQTZTyhydDsWRtY0EwZGdnaZOc8zJgYKjb3xj4XI1l47sji7OuCIcsA33r+B4nGDcDwHfy/FIPIQjMFpN+a9C5tj3Y621p2X3HXOaeaLszNoVcCtjayBJzB7AI4MMNhKJKv6szHsmwtAFc8MDU5JtTEuyz2hhV57ldAfDZ87zE2aWZi+R5j77zD1mcFlZ9QVAEOMzeJZUipTdJSVe36URT4Gq8hLMekWC5hXcIGTfpCVnudOrH7RNvK1ZsxGzCri5J358Y5D1a15NVSl0W5yXtwBsKdjULny8kScMS9jbrVhR8nNxjPJrd4jDmDFYG9MvTF+MwY4UOnHiJGHLB2Khcc+d6heVj6amrfYuQljz31hu8vzcrANvkYx/ryayxW+BrsYbytC20OsVU2WKRwLLECOe3J+mERjbnsbDcTGcxuID1PI+Yk/tFxxVeJWt0MM/QTg6NTOSHa7h691ykydRyVeOwYVJOLaGIq/JE/deJiQZfn0i1cFTZt3PqH4lGyiS1gbUniw59TsoyaDEexLyL8+51kByv96/HVpma2LAv6Qx9GNAesml2IlINbY6yXnEKrWB1MkXO/j3OyzRroaxMwS8V6SPKPxtkqHXCrukSnAqLer5yz6yemM8Y02uJTOZ+XizPsLW6ojeIgd+mxL+ISPP9lYxG2/vOINmfXY1SrOgE9NADYfGYcuQrOYm6yJC1OeWlXRrwmsaoktVceEj+/1f5w0zvPdq37RTXj2bVIz5Eer/DWy6tX2rWYDTBxr8eWUzw+tSU9EQuBgfNHmj9M6Dz7a+6NgIx3aDzTGfG2jrGfH0gx2bVS3qL6DkWfx9fySWs7TBmOS4aQJ5MDP7PU5VAramBEcHaAs0NDMjkESpeqr/sPiZ/1TNo88eMUqsRir6GEP2zkfrFVw4fsixVPTaYLwerOXPgvtzUsoXfo05sD12Cglo7ycReDsc+ByqSzf43jkSRrxzOArxYKZ4L8mZZrutRz6WgNHXErXuPxsXEiGwtSxAcHwuEwnCbHlbFoPKaIfeSS1yRo6qtMc+6ToBp0bntGiRf7osvB6ITV2rGNOj3anmz5Mak7Pa+5QNWxWlKTh5a1ol4JcTa3Jpo431Yuhi8D8bRiQ04NDxogRuIr/ZwwLazUZCms3Ouw5/YCDPsdkTf424nzjWYS0jAUJDrLRM+qkR0uXdVWgw6wX9zx76G3OChudMrLckaPKlXQwXeCrd+7+6c1IwT8f2WktxkUzQjdx1lgaje1ZZZi4hHk9Z70NoKSsvBmjO6G/POhjjIJQTm+qsJlODIyZn54N7G6RUOmd4gpMajGP0uXaSjwGCtQTDQSqQx3y0SZVzDcLZ916gRe1vDCRk+3mTu0n55TTv7aNJ/RKzItcyrNMnfUicw8RF+jHjF7/SUwJjp4NPK8X6FB4Y/YmAX12yqT7tXmc/RgntfLBMbGYRq2c7GRbX5in1PpqXJTDjZAaz4udxzvHLlyIikxce+P5qQ8Z36QdM3Y95S+dWjF8UIq91WDORfigGVXMB/67uBvaTblxrQfZC7rQhWLclX9EpmvwiqeJ5EozoXfm/hK7KIohpdDY/iYZl0HmzzlJuykiiQjZhApaUtwap9aWsjg+VUIr7gv36SWnprxbe3f5fNEhOitUDoSStjxiZic4g66+tI1eN2+6PHusWlr6Zsgwe9A/WKJhbW4cyn4IhkqA6BiPRhcr7HsEtq3im7g0/aA/BjojR4ZKbNTMhnS2/lUIwGaNEFLYAxiKPRqEYlDDcbD0/Kl2rTjsh1+qH9tsBQ5cZvzcKY2GqDWRyesF+4M3WboeXVGl7iMi7gxGFGSsPxYkL33fz+5KAqqcIsysGtlf9eNNbXbV0bOeCfwGWNMQ4wgo7cdIGGn1wA7nh7iJiYXQDjvAxsg8fwmzGdfYBVE7Cde5+Z/B1lseyNm0L6zItLQ86mlmDcpN0NQ2yDp2IHDrrNU/viXGLTXgg1lE8gFq7f2gYtlnL3/VgJ5Zu/KDUTrOUvVGz70UJ5m41T+ivM5gBCpQOvQ+T4grKHv6aXHAnoE3+6VtKVRW24NhUJgs2UapEWfM9ttGpIwl9+XlOZ415F1nqjP7NFMIL80rWwAYFFgbTGa12/pgMg2943FHzaOAWrP++pnESdeQn6quVXuhdcN26qW8CzPSfB/bIe7CsWz5QfaPbbsnZ5segJlGSrX+0YVJXGdJE0rywl49PfrHGHhp43dZf/o/ZHlnaWf13zUvIDPjQciwkFTgCmhxvZSzZQ4twb5mraKM991YngHL37zvbFgAiGOZuZEcGNM/9+ZBYtV7/3BhA6ee8yzqMEK8j/4zskvh66MASr0FyD6bIb1CcAdeA9viQCNA+g3AYDayGZwvnGwdudYs16inzIQ2u9Jxhf0d07jabD2E2vJym1JAXdSPkIGjHAMXDF4+WgzWjjPGi30ZyPPSC/A2J+SaePh5UYePkh23NblJzswQSDFkW6ZRr4ynVJZI8cNUdk3kjo5kK6zA+OWseSoviog3gMwKg1ZMde5ghN3OnPrM3vv5UB6tePVtbNn5mj6pHtE3Vg/TLb00gJv1k7QfP0/Se1bps1vvps8R3b4x8GaX7rjjORxSWi/t5ykeTOCBh54y+VNSo8u9S5DfLDhwUUZRPas4MpJIhw9j4u1n4OLJAqHIo62bn3Iin7Z/2Iln7fzK4dqGQ20VTFcLX2SNyTf4p1+A0Do8FhgtdrnXWRoqSd55GeunXh4NPPm1a8kn0cDbJOAV2+qDtpC/omHa6YIKWePky87KPf8Fjq9dMU47eshnKGmnt+ul13rrbOgE19jrrVWPYHl0lqauXIOLLLdB9kWEpN4j6/hpot1oH6Byhwtmvknd70Rb4gI0JEXxkiXJOV13XFvmRwgtj2FTOgAs1oyN32WGlV+2kcSIa0JH+JhA1kaQ/UiLQYfYuhs/H0YdpJEEB04tV2e7wFXNtnUhRfD2glPSmxQAxvPoKAd0AMgCn1ddYXdY2x8p6wqRYKzGWkcgXeq0Sl4j+usuj7O1I1RsaW1PzhvPhX5druepDfIcQ/sOwwztgLVH3mofvxGzeuQv62YrhIvCt/op+BVtEjJDG/lytJdpQ/Bc9wahLqmuDX0/Ru+dD8YsGx22sCgSodUVawRRLziCIYE8veAM2EivxP2BcvwWYlFGZnOtDWiWSZs+sE57tLoAf9DUjGVs2Q47ZV/7qpWfjhTmZwAl2PGBcTMvH66cPNrn2QqO0l40IegqIAx1/1ayOub43dqIkxVUyvK1g28HN4yUIH9h/TGr6Cx/P+Sxeej8hmTrZ171s5h5QgeLuOM85+PqnyO+ghe1FJWgKzIYN+yc3GO9HBYfPvWG3b3+itgXkd9S5zFtgEcZ3JrgbiySU1a1XL1BdGQfoekfI6bLCaE+EFQreDK0gZ8S07+DET2j4Gm1gximTjodj0IeTSYdyIwNWrUEvWwMvWFc7oNiJTDCmbkgSIEPv/A0iJn77rN3hMabyuVg7LHOldx9udGzVHIsEsyNQKP7OQuXk9Lkc1JqBtGmS7M4Ded1ToMuurXtEYuAVA15YH4Fexad+OxgpeJNUZ8H8s2Lo9OLQgBm4esiDRd+ZbdlsOdZ+j2m95TZdyP6CH2sDDCDEswxaoub2ek5IjaLvvFdhjlPdsycVf6tlekZky6t62kL8Yutp/FdHyjmuKfXh1sJmg1/adjJNHM57Zu+YcEOu1ZPqmSM9M/bgsTBKT5D2toCVAPlNv5OZ1cNrHMiAPPSM876opfe+PliRybiDxyQ5dGT44R5jwaWhYhnhe30/HSC5GSdWt1HaUyjEhVXBgurj5xth8LqJTBCru53rmsw5tAKZYGOmxsy0L9nhpQjlDSMsesnWVTG/9ExvXVagUHNXMIzZv1izUCvFy+ZvzwqnXe8Y0pCkAqHfDdjxEQfTF9XTQ+SD/aiHdDI1wJDh/LDwG7Exu2dtPxSusOET8vG49uDzpdsYFRzjFvVVo3iUVqjsUEsoh7Ijqzz40t8lrxJR1qrC4o84GOmrUnGRy+t5VWPKnE8dHZLQdVBH6WB9ahaPT9ZZyY5Ctanbnum8IXlg3wCtlLtAiHNgt0w60ReiQUN5Q/lmx3dGry2dZHUP96u/phe254cswy1NisPVzLXbGlBO+a5QVOBC/2jNedAx6brpW3U9uMLLsJH35Ji1o3ckcKe1aMJp/OSF8NSS7HlJ1HmQI7IFFVu+TVQeHJCtSJNeNFiHedYi77YNs7zNB4vv61FlbsekYxRJRYS66NUDoz33KnneIZax0EL2ymUqqZGZT/oR8Fc+4eCHzIa6s5SF7CwBKn9BOTi9o6OTrM2tge5Uumws2ElRelCebDCiyWyDApi7AIUtxxuG8ycXvGu1BFavaNr17GcKKC4HeStN54uwRslssFqhldgrXo2CR365OcnNdQcDi0VwW+GWB+GL1ikvameXvfHBCYJR2PUW9tPP6YAKcjaOG6WPBkGcvHPj7XyU24vHtq9EW5oFLLYwU1affaBHUavDbfj7lsfM+kOudEpghkvOWk3vKB3naMAMQF8VBthum+AKBsxaIdmdRsizRjJpK7S1QrXBu0xqqx5N6EJUOKU+ettuYaNGR6ceePq/IxbRrT6PoPPrIpK7Mtk2KUW5j0osRZ3VS1bS05HnKyMCJCarVyMXBOStqDP90/4Xp0fUt3Gz5Z28u8Owx4yraCEE+mnddJnFGJka8vZqSeNuxkjrZm7ER2b20rN9OLCmpGwfAhz6My5POsJj0gj7zkA1Y/GuTZ2heFL7d68tftWEgzqcZmbn/znJwBpFw/TWGdSS7QEVf3Jso7Yuj6zMe6O29fa/2yiAV21zkWbEQZxIptjrzSa+oGat58f1JjKtCE9YLMYGI+A6ex4HR8kuFJvyNVPGoBaBauOsYzFPHAH5ChtRmJqgPxPGfi04XXQo7LUegXcvTbO4sov10bwqOT8Y/v9xKRvqzvCS88025BYw6jbVm8ME3IwCmv4kZANerIuh6u6rItl4UMeUht0DOz7HBO+h9BlkD/M9V5xS0PDmcjrN3K/NpQYckdxYx3gLTkGAdWm1b2wTx3LSk7O2VjxWnnYUkRC3s+Sjj7ZU5pjH48KREg2NlIw2ob7A/O6LUtwJT8tqLhWCStM/Q2kHHOMe90/dbY/axUMieRgKzC1QlvTMTYfYsXrKkzKD8+bwsAGN4l5MsE6y6M/513IWfNfuLM7dc+Xf/AM3CuU+X8kpDU0VvL+8LYqM++O58fsKwnu3VQsbfNop1GbDdz1eGKHBgtK+kvq/OHoP3KQQncUSs/0lqd+RnkjTi+DVzv24mOu2MeRKtKvJduuVERLS0FCKpiC6i3OYt4QVQoWOmbpmIYLLidHYQOi3OoAViA5tjZiNc/WZa1RenMtZzYQszc6zFj0lunacibw7sgB+tnIhLPtyAoXf7SZ6w/ryHNZKCLUvKqgyuZV4t5TVrcr+wSEEc9AwbF5uXpk79vRq9HVybt06Vjzq5/owVqBJsBQr/8tPjA53uZTfqsQDW6XgZyRymrdQTn3kwTU6lORs+iSfTYrTGK8UaPr0lxvm9IsFZuFMa+dzOv5wTtKAXsMo3oPyZHGdGpZjai6wN1QfYFg0Gd+FEutNRH1PEOO2szQWSEOo3nArQII2JR7zX2IApI+WJvjjiXyr7rhuRsz8JWl5stK1mD4boCOGBXsnjEWvvDZd9aDJzO0jNxW5DvfwYgurwYDEGUFT+Us9FFP3ymNEqe02kpsNpxk+UyPo2bRDwlkzdmZD+sKjPeldJQif2L5pvWCGZ7RPc3IWXXhL81k/VdAcbFavmfFZzO2gDi59wchwJocAkPVC5iY57a90YllquapdRYxPkFa+ubW4syHqYKUXDxUHeO1ineFr9CNTdct8y4hU+D3tWZCDWuewnxcozDn72AEqvaP4ha1N746K2GxScOOqUB+GV6tFOEgNsIAA9IKwwFSuukl8aIrPf4JCYbH0pt5Bz9Vw6rnMFZ663CSkodSvfkIZyULjy+qUPFmjAgTb071Bjzqq3EW81lLg9L5i3LhqMYMlRmH9pEbuwMqpyjYZWuWPusAmdKLFCLZhI4J2+jAgdUaAAR2smZs52eacdbG7ei8P3uG3h//mXUutSlbekZ5pkBiMVu2WgG/V4K1uJFwBtxoFkKQu1ZMDVS5JHuSdwwIoORs4dOzodU4+5SVGHY9EpSL/WjpN1BQX6BDL/81NEidpWnacU1dR5I5mppaOJWf1ItqbXmtVxZVXvdQjYsGVjcJIbNQHFJYtcut5BOPpnlezDtbt3WSW/U8m2snVEeDNcy4fzRlprdfAwUGnDy4QwOgG3lt+B2DR+NWNLpBZ3PqQZ57lJCXMSgd9DzE9hc91E+2g9ASZ85s29jbrhgf6mBmmX2WCTjrnDUGQtXBEFotxSr8P5tGfDbe+IxJS23MkOgIOlXkLoa4rKAfi88Vjuq0gaErEh69GFpVqEP1Wd94zWZr1tfqWbZlUKEvChsS+tLlZxJdb/il40DmF+z110SllHb/JHNbhzxwqmdT7hiSUc0hIX0H/TPj0n5OSyGP2lMCbrAX3clG/7tVgK2js3lVz4Ignd/O16XeY/LfW6fRiiN9LFNr4TH1ZyFyUa9VIL4oNPV7BKkZv7O28Ry6q6/TyVSz0lq3xSJGZsNOMOtZJ/2fRLjaEbLhRPj9rxHhwnwQsGb5BUYqloTGVoCsP5cZGZ8fTjI+AoyJARh/CO/HHAVjJLoX1DXlWmnPxtqoV8TIs+XhaMaByEkXbt3Rm+w7q3I+q3LH83LZyIUzPyrC0/M0NU/RtJGWDThybsZI7ySgfxI5UDE9X/x+6Rw45PayTtZM18HyThhMOGI+Cit04dIhA3Mk/es4b+jhMAL80ZNyLCNLWyuFWZZwjOJmkbzetONtO3srvP6MVzI78lr3JOLd1mgLwtzU+lY7L8bzZ4fhMOJnSWql48n6s69VmE3bTi5YLY8Yfn4U+/J/wVtVeqBEPmsY1gvIaFu4FLKezT69g5GSHDKry1xPMN5DyMG4smwyOowTvhwwGwSuWyLMY5hIDDn1Y/8fFnodhW84SOqqjz55pRbdGx2y9tlj3jq8Te2I9tRngPcSf4nyvuNx7/VoVq/78aMMASHr71ybZgQdyJp95awHVa0yJW1HVqHLC5ZWCSiY6B+5nwTm1pL0RS4MEYZ9hx2X+Q5NJhouJuXzLCNTVRHhuf/Z6WavGbZ0Rnkd50ceITsABHgEG5ll4hwMFLx2PzmBaoPD15DHQupANBnFSZBJMKxg413fnaPJJuLNFi5+jhIQSBlCz3K2JXwe+qoPQ4vDHIObMCZGHofG50fcpR+E0wYndxtS2gaG1AYFpZxRLK8FsQFVJMdk4zs/GLRv4XrcAXG+t200DjFOhvjpDfcF2TxnU+HBje9N/ajTgYXZDnbwORPVMUrcmgFKDM7kswwospHIKVgGdCs8WOXPY/4uCjgvZUOZghvQ+VWqDp4/wP+G6g0tLxaLjgNrMT3xw4ObXaSzModsYcvc0hXDKXEwyXOZvEY8LC3kjQAZsJ/RdfKwN5HPLcOWOAjya6YkviNuaMT6Y7d44Ns3wqbSLxVkYeyfjwGOq2oYAWPJZ1lzH+Oa16KS3KIcJFU+TkhqI2k+mElJDDBCOl/jBRuVcfYYQi+53qZrOMYaPOeNqdFimFpAI7UwjUnvC1twYGtT0E9dLbn2iGP1joc+m2+waLjNV6/UaDbMhB1Sxum6TBFFsaFB/VZ7i0ZsZcw8ay0epAuvkfmqDBvBTD02PRYt61I7Wl+lQqoxlg2mcq/mg/FlrwnLfTSfzdw2E3lTP7mI2bEJIzBYUTNLrWrdQY1iA/vd7XZbF7x20NeobThr/b6ofi8kS8ASnd1s5mXbMJdjcPDSI8RlyYrWw+xBkE5oNR8yyzgreXU3efKsvAtDTDmj50cZqQtndjps9ro3UvbRIHc740UEtT76lxlXJmm3VkUA1WKIAyN5nmVIuARO3Uf93si6NKpm+U5LyvoORnLQMYdmC4EIZBu9JtW8cLMctDard23HQNKxLDtOf4wmVw81mkIQz3IUJDpNF51ns6e3XPhox2REfeSjHQBNhmwrCKzXk62vCRY0H63OTIgoBfzMqbS0RJaNV14xYVKONHolyY4XHWkdMZ8EnEFoKf2RudxPWA5E3gY4MYTIgofn1p6dy7ZeZSM2Php2nnbjx5JapsrcjJEXcl2b8vJf/l5B+HvGSYrUTTyjqUMfwVrwoFBkQhGuVQ3o04MzBerJfj2kdYfIMqhBca2ksiamRj2F+D0rHXJhKhkYvhoilsr7r6FiSazgHxbh+qY7/P5lUsqMlR8KWJxuO1XYxtp0rYCzzmZraB4080TdG0xd6py886CL9sG1O+Emrh6zbdFmW05uf6pdmi6j+E9+apk3y2Jx7nDchQE7NrtBHWg/XxnzKZ8Xw9E/ZL0XjpYTx1yFJ3ur8+Nycmo2j3rlrLonbjLNywqdXjkeUu3zTCZGn8bMNqGWHGvbjyFw6j7sMOD6gl3L/MfwbjYGStSQE+DHFBeZSV41mUmwfIc4jtmMpVrxdlj3Yq6x4MXOYzFbffXWVI/VjcFREfZ0tMJ+s2UI/soR72BE/kS9QYAeiiGgPTXPmV8nw9GpRU6TjppHP8RZJOKl1/9QY8fcKzpSWXMIKI7OtWa1G6zEpm1E5Cy7ZyzFN+fQ+zU70UUrooj6Ix0TxEjRLM01rpqOuejRuMmMXF4qTgu9kwmNu/Kugkh5cYZlIg1qFGyV+4TloYnC2F8YO7kOy7KJeLuPsOGKO7JhGdxQa0/uWRIDhWNMMo6BS1aejYNu593wKmgYmOntfPQo7mnGfiWHwqQINf8YbmKKpH3NMp9mwyGliQ6IZ50dTb2QtXJA3zq8GW6B9Z3CsCPHCdeOuRkjvWYVG69jzC9npTx7I0RtsItx3/mxXrboXo0i08o+SmsUYR5ZBc9jdxQo2H4xTDLmgF6ud05emudDdRX06d7P7rn4/poLwX3nY2TyUAXWefQ743kQfjsfYehqkg5OTKM8ZAdYdpIEcBxDyZ7FC2JpOJbZA1sLN+GbpQqTkPw00SPZYvMFC83fj8lfLrx6G4Ls6aTcfAcj5ijOTvUZN+EVg6UlIT+DI2pWtfkmY6h4UnHbMEF+9xrJ9pYlBTJ0NldHSw2KN9kF5xlB/OBvP3GcL3RInz3IBFVSdWX3Si9INXo3lk9OHnanIP/Tz9B4bWh8QLU5a93C/a2/Z69JpFkCy7HCMdWpKsSDsiiTzMEg6Ggr1wbGaxOygw2K3Vk3MTwiZpubbY+RyeD2kiPVBJFP41n+I1s6diq1triEZ866XGIXSrE3WlJQNQJhGKxQZnSUkbH0TyiK61Ew6L3zwh6Natd1SwhuDGfTPK9nTfTNZkT2TAj72egtLyNI0Gf62ZxtdvdaL+Z8kC6nyetO801NMlPCsS7+rmwum3hz9BclTGfFMMRnAxwQBe/kQzQH8w/XddVOkjaH5qxj/fJdCDhd9iIOiNLfvrpBR3PzPMPMxHyGvjIf9rTBEMjEoz46kZZVkei+bCcglvR9er0WXRIneGNdVc5hGWMpr8AbZgfBDDSNgWlb7+knhEVks0ZAQwpSXut/amgk5fkcVYYAAAAASUVORK5CYII='

const CSS = `
.fs-stage{position:absolute;left:0;top:0;width:1920px;height:1080px;overflow:hidden;background:#060708}
.fs-rig,.fs-cam,.fs-stage .creep,.fs-stage .fill{position:absolute;inset:0}
.fs-stage .bleed{position:absolute;inset:-48px}
.fs-cam{transform-origin:960px 1400px}
.fs-stage .creep{transform-origin:960px 700px}
.fs-ground{transform-origin:960px 700px}
.fs-stage .it{position:absolute}
.fs-stage .it>svg,.fs-stage .it>.ly,.fs-stage .ly>svg,.fs-stage .ly>.ly{position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden}
.fs-stage .drift{animation:fs-drift var(--d) ease-in-out var(--dl) infinite alternate}
@keyframes fs-drift{from{transform:translateX(calc(var(--dx) * -1))}to{transform:translateX(var(--dx))}}
@keyframes fs-bob{0%{transform:translate(0,0) rotate(0deg)}12.5%{transform:translate(3px,6px) rotate(.2deg)}25%{transform:translate(0,1px) rotate(0deg)}37.5%{transform:translate(-5px,10px) rotate(-.35deg)}50%{transform:translate(0,1px) rotate(0deg)}62.5%{transform:translate(5px,10px) rotate(.35deg)}75%{transform:translate(0,1px) rotate(0deg)}87.5%{transform:translate(-3px,5px) rotate(-.18deg)}100%{transform:translate(0,0) rotate(0deg)}}
@keyframes fs-bob2{0%{transform:translate(0,0) rotate(0deg)}12.5%{transform:translate(3px,6px) rotate(.2deg)}25%{transform:translate(0,1px) rotate(0deg)}37.5%{transform:translate(-5px,10px) rotate(-.35deg)}50%{transform:translate(0,1px) rotate(0deg)}62.5%{transform:translate(5px,10px) rotate(.35deg)}75%{transform:translate(0,1px) rotate(0deg)}87.5%{transform:translate(-3px,5px) rotate(-.18deg)}100%{transform:translate(0,0) rotate(0deg)}}
.fs-cam.bobA{animation:fs-bob var(--walk) ease-in-out}.fs-cam.bobB{animation:fs-bob2 var(--walk) ease-in-out}
@keyframes fs-beamSway{0%{transform:translateX(0);opacity:1}12.5%{transform:translateX(-6px);opacity:.985}37.5%{transform:translateX(12px);opacity:.97}62.5%{transform:translateX(-12px);opacity:.99}87.5%{transform:translateX(6px);opacity:.975}100%{transform:translateX(0);opacity:1}}
.fs-light{position:absolute;inset:0}
@keyframes fs-beamSway2{0%{transform:translateX(0);opacity:1}12.5%{transform:translateX(-6px);opacity:.985}37.5%{transform:translateX(12px);opacity:.97}62.5%{transform:translateX(-12px);opacity:.99}87.5%{transform:translateX(6px);opacity:.975}100%{transform:translateX(0);opacity:1}}
.fs-light.swayA{animation:fs-beamSway var(--walk) ease-in-out}.fs-light.swayB{animation:fs-beamSway2 var(--walk) ease-in-out}
@keyframes fs-flick{0%{opacity:1}22%{opacity:.88}46%{opacity:.97}72%{opacity:.9}100%{opacity:1}}
.fs-stage .flick{animation:fs-flick 2.7s ease-in-out infinite}
.fs-rig{transform-origin:960px 1400px}
@keyframes fs-idle{from{transform:translateY(-3px) rotate(-.12deg)}to{transform:translateY(3px) rotate(.12deg)}}
.fs-rig.idle{animation:fs-idle 7.3s ease-in-out -3.65s infinite alternate}
@keyframes fs-fIn{from{opacity:0}to{opacity:1}}
@keyframes fs-fOut{from{opacity:1}to{opacity:0}}
.fs-stage .fIn{animation:fs-fIn var(--walk) cubic-bezier(.45,.05,.25,1) forwards}
.fs-stage .fOut{animation:fs-fOut var(--walk) cubic-bezier(.45,.05,.25,1) forwards}
@media (prefers-reduced-motion: reduce){ .fs-stage *:not(.rmx){animation:none !important;transition:none !important} }
.fs-stage .rmx{position:absolute;inset:0;transition:opacity 400ms ease-in-out}
.fs-grain{position:absolute;inset:0;pointer-events:none;mix-blend-mode:overlay;opacity:.035;background:url(data:image/png;base64,${GRAIN}) repeat}
`

export function createForestScene({ doc, root, forest, walk, strobeSafe = false }) {
  const win = doc.defaultView
  const { W, H, VX, VY, F, D, NS, ZMIN, M, KCAP, STOPS, CAPFADE, EASE, clamp, fm, fm4 } = forest.constants
  const DUR = walk.durMs
  // per-document instance number: keeps generated ids/keyframe names unique when two scenes share a page
  const inst = doc.__forestSceneSeq = (doc.__forestSceneSeq || 0) + 1
  const kp = `fs${inst}`
  let uid = 0, walkId = 0
  let walkT = null, cutT = null, creepT = null, idleT = null
  const clones = new Set()
  let frozen = []

  const cssEl = doc.createElement('style'); cssEl.setAttribute('data-forest-css', ''); cssEl.textContent = CSS
  const kfEl = doc.createElement('style'); kfEl.setAttribute('data-forest-walk', '')
  doc.head.appendChild(cssEl); doc.head.appendChild(kfEl)

  const stage = doc.createElement('div')
  stage.className = 'fs-stage'
  stage.style.setProperty('--walk', DUR + 'ms')
  stage.innerHTML = `<div class="fs-rig"><div class="fs-cam">
      <div class="fs-sky fill"></div>
      <div class="creep"><div class="fs-groundStatic fill"></div><div class="fs-ground fill"></div></div>
      <div class="fs-light"><div class="fs-gmask"></div></div>
      <div class="creep"><div class="fs-world fill"></div></div>
      <div class="fs-lightsTop fill"></div>
      <div class="fs-hush fill"></div>
      <div class="fs-topdark bleed"></div>
      <div class="fs-vig bleed"></div>
    </div></div>
    <div class="fs-grain"></div>`
  root.appendChild(stage)
  const q = c => stage.querySelector('.fs-' + c)
  const rig = q('rig'), cam = q('cam'), sky = q('sky'), ground = q('ground'), world = q('world'), light = q('light')
  const creeps = [...cam.querySelectorAll('.creep')]

  // ---------- screen-fixed layers (v3 staticLayers) ----------
  const lgrad = (id, x1, y1, x2, y2, stops) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${fm(x1)}" y1="${fm(y1)}" x2="${fm(x2)}" y2="${fm(y2)}">${stops.map(s => `<stop offset="${s[0]}" stop-color="${s[1]}" stop-opacity="${s[2] ?? 1}"/>`).join('')}</linearGradient>`
  q('groundStatic').innerHTML = `<svg width="1920" height="1080" viewBox="0 0 1920 1080" style="position:absolute;inset:0;overflow:visible"><rect x="-80" y="${VY}" width="2080" height="${H - VY + 80}" fill="#2a241b"/></svg>`
  {
    const gm = q('gmask'); const B = 48, T = VY - 60
    gm.style.cssText = `position:absolute;left:-${B}px;right:-${B}px;bottom:-${B}px;top:${T}px;background:linear-gradient(to bottom,rgba(40,41,43,0) 0px,rgba(38,39,41,.9) 60px,rgba(36,37,39,.97) 84px,rgba(26,26,27,.95) 110px,rgba(10,9,8,.93) 230px,rgba(0,0,0,.9) 442px);` +
      `-webkit-mask-image:radial-gradient(ellipse 470px 150px at ${1085 + B}px ${300 + 60}px,rgba(0,0,0,.06) 0%,rgba(0,0,0,.35) 45%,#000 100%);mask-image:radial-gradient(ellipse 470px 150px at ${1085 + B}px ${300 + 60}px,rgba(0,0,0,.06) 0%,rgba(0,0,0,.35) 45%,#000 100%)`
    const beam = doc.createElement('div'); beam.className = 'bleed'
    beam.style.background = `radial-gradient(ellipse 360px 105px at ${1085 + B}px ${1000 + B}px,rgba(255,244,214,.20),rgba(255,214,160,.07) 55%,transparent 100%),radial-gradient(ellipse 720px 420px at ${1300 + B}px ${1120 + B}px,rgba(255,236,200,.05),transparent 100%)`
    gm.after(beam)
  }
  sky.innerHTML = `<div class="bleed" style="background:linear-gradient(to bottom,#08090b 48px,#0e0f12 288px,#16171a 468px,#212225 658px,#28292b 738px,#28292b 752px,#1c1c1d 808px)"></div>
   <div class="bleed sl" data-st="0" style="background:radial-gradient(ellipse 1150px 150px at 1008px 753px,rgba(150,86,40,.32),rgba(120,60,30,.09) 60%,transparent 100%)"></div>
   <div class="bleed" style="background:radial-gradient(ellipse 620px 300px at 1008px 48px,rgba(62,68,80,.42),rgba(40,44,52,.16) 55%,transparent 100%)"></div>
   <div class="fill sl" data-st="10"><svg width="1920" height="1080" viewBox="0 0 1920 1080" style="position:absolute;inset:0">${forest.moonSvg()}</svg></div>`
  {
    const tm = [95, -20], bm = [390, 990], ux = bm[0] - tm[0], uy = bm[1] - tm[1], ul = Math.hypot(ux, uy), nx = -uy / ul, ny = ux / ul, hw = 165, c = [(tm[0] + bm[0]) / 2, (tm[1] + bm[1]) / 2]
    q('lightsTop').innerHTML = `<div class="fill sl" data-st="3" style="opacity:0"><svg width="1920" height="1080" viewBox="0 0 1920 1080" style="position:absolute;inset:0"><defs>${lgrad(kp + 'msa', c[0] - nx * hw, c[1] - ny * hw, c[0] + nx * hw, c[1] + ny * hw, [[0, '#a8bcd8', 0], [.5, '#b4c6de', .21], [1, '#a8bcd8', 0]])}${lgrad(kp + 'msv', 0, -20, 0, 990, [[0, '#fff', .45], [.7, '#fff', 1], [1, '#fff', .2]])}<mask id="${kp}msk"><rect x="0" y="-20" width="900" height="1030" fill="url(#${kp}msv)"/></mask></defs><path mask="url(#${kp}msk)" d="M${tm[0] - hw} -20L${tm[0] + hw} -20L${bm[0] + hw} 990L${bm[0] - hw} 990Z" fill="url(#${kp}msa)"/></svg></div>`
  }
  q('topdark').style.background = 'linear-gradient(to bottom,rgba(4,4,5,.9) 48px,rgba(4,4,5,.55) 120px,rgba(4,4,5,0) 250px)'
  q('hush').style.background = 'radial-gradient(ellipse 760px 330px at 960px 540px,rgba(3,3,4,.3),rgba(3,3,4,.18) 55%,rgba(3,3,4,0) 100%)'
  q('vig').style.background = 'radial-gradient(ellipse 78% 74% at 50% 52%,transparent 58%,rgba(0,0,0,.5) 100%)'
  const slCards = [...cam.querySelectorAll('.sl')]

  // ---------- mounting (v3 mount, verbatim apart from doc/ids) ----------
  function mount(it, z, frag, anim, css) {
    const id = kp + 'i' + (uid++); const g = it.geom(z, id); let [x0, y0, x1, y1] = g.bb
    const z1 = anim ? Math.max(z - D, ZMIN) : z
    if ((x1 - x0) * Math.min(z / z1, KCAP) < 6) return          // never reaches 6px wide: not worth a layer
    x0 = Math.max(Math.floor(x0), -M); y0 = Math.max(Math.floor(y0), -M); x1 = Math.min(Math.ceil(x1), W + M); y1 = Math.min(Math.ceil(y1), H + M)
    if (x1 - x0 < 1 || y1 - y0 < 1) return
    const el = doc.createElement('div'); el.className = 'it'
    el.style.cssText = `left:${x0}px;top:${y0}px;width:${x1 - x0}px;height:${y1 - y0}px;transform-origin:${VX - x0}px ${VY - y0}px;opacity:${fm4(it.op(z))}`
    const vb = `viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" preserveAspectRatio="none"`
    let html = ''
    // per-layer opacity: skip when invisible at both ends, keep static when the change over the walk is
    // too small to see, animate (its own composited layer) only when it really changes
    const animL = []
    g.layers.forEach((body, i) => {
      const lop = it.lops[i]; const dr = it.drift && it.drift[i]; const fl = it.flick && it.flick[i]
      const v0 = lop ? lop(z) : 1, v1 = lop ? (anim ? lop(z1) : v0) : 1
      if (Math.max(v0, v1) < 0.01) return
      const la = !!(anim && lop && (Math.abs(v1 - v0) >= 0.04 || i === it.fastDim)); if (la) animL.push(i)
      if (!la && !dr && !fl) { html += `<svg ${vb}${lop ? ` style="opacity:${fm4(v0)}"` : ''}>${body}</svg>`; return }
      let inner = `<svg ${vb}>${body}</svg>`
      if (dr) inner = `<div class="ly drift" style="--dx:${dr.dx}px;--d:${dr.d}s;--dl:${dr.dl}s">${inner}</div>`
      if (fl) inner = `<div class="ly ${fl}">${inner}</div>`
      html += `<div class="ly" style="opacity:${fm4(v0)};${la ? `animation:${anim}l${i} ${DUR}ms linear forwards;` : ''}">${inner}</div>`
    })
    el.innerHTML = html
    if (anim) {
      const lstops = it.lops.map(() => []), ks = []
      // once an item has left the frame, hold its scale (Chrome rasterizes a layer at its largest animated scale)
      let hold = 0, tcap = -1; const pbs = g.pb || [[x0, y0, x1, y1]]
      for (let i = 0; i <= STOPS; i++) {
        const t = i / STOPS, p = EASE(t), zz = Math.max(z - p * D, ZMIN); let k = z / zz
        if (hold) k = hold; else if (k > KCAP) { hold = k = KCAP; tcap = t } else if (pbs.every(b => VX + (b[2] - VX) * k < -M || VX + (b[0] - VX) * k > W + M || VY + (b[3] - VY) * k < -M || VY + (b[1] - VY) * k > H + M)) hold = k
        ks.push([t, k, zz])
      }
      // a near object still in frame at the cap fades over the 400 ms before it instead of popping out
      const ft = CAPFADE / DUR
      // anti-strobe: a bright layer dims while it crosses the screen faster than ~7px a frame at 60 Hz
      const fpS = DUR / STOPS / 16.67, sp = ks.map(([t, k, zz], i) => { const n = ks[Math.min(i + 1, ks.length - 1)], pv = ks[Math.max(i - 1, 0)]; return Math.abs(it.X) * F * Math.abs(1 / n[2] - 1 / pv[2]) / ((n[0] === pv[0] ? 1 : 2) * fpS) })
      const stops = ks.map(([t, k, zz], si) => {
        const m = tcap < 0 ? 1 : clamp((tcap - t) / ft); for (const j of animL) lstops[j].push(`${fm(t * 100)}%{opacity:${fm4(it.lops[j](zz) * (j === it.fastDim ? clamp(1 - (sp[si] - 7) / 10, 0.35, 1) : 1))}}`)
        // strobeSafe (preview switch ?nostrobe=1, Ben 2026-10-01 'i want to see it without it'): any item the generator
        // estimates above ~4 px/frame dims toward 0.3 by 7 px/frame, WHOLE item (v3's own dim only touches one sub-layer
        // and only reaches 0.35 near 13.5 px/frame, which is why the strobe gate flagged 7 dark layers near 8.6 px/frame).
        const sf = strobeSafe ? clamp(1 - (sp[si] - 4) / 3 * 0.7, 0.3, 1) : 1
        return `${fm(t * 100)}%{transform:scale(${fm4(k)});opacity:${fm4(it.op(zz) * m * sf)}}`
      })
      css.push(`@keyframes ${anim}{${stops.join('')}}`); lstops.forEach((s, j) => { if (s.length) css.push(`@keyframes ${anim}l${j}{${s.join('')}}`) })
      el.style.animation = `${anim} ${DUR}ms linear forwards`
    }
    frag.appendChild(el)
  }

  const rmOn = () => !!(win && typeof win.matchMedia === 'function' && win.matchMedia(RM_QUERY)?.matches)

  function setCreep(on) {
    for (const el of creeps) {
      if (on && !rmOn()) { el.style.transition = 'transform 40s cubic-bezier(.2,.5,.3,1)'; el.style.transform = 'scale(1.045)' }
      else { el.style.transition = `transform ${DUR}ms cubic-bezier(.45,.05,.25,1)`; el.style.transform = 'scale(1)' }
    }
    clearTimeout(idleT); idleT = null
    if (on && !rmOn()) idleT = setTimeout(() => { idleT = null; rig.classList.add('idle') }, 40000)
    else if (rig.classList.contains('idle')) { // settle out of the idle sway from wherever it is, no snap
      const cur = win.getComputedStyle(rig).transform; rig.classList.remove('idle'); rig.style.transition = 'none'; rig.style.transform = cur; void rig.offsetWidth
      rig.style.transition = 'transform 700ms cubic-bezier(.45,.05,.25,1)'; rig.style.transform = 'none'
    }
  }

  function build(c, animate) {
    const fw = doc.createDocumentFragment(), css = []
    const list = forest.collect(c, animate); let n = 0
    for (const [z, it] of list) mount(it, z, fw, animate ? `${kp}w${walkId}_${n++}` : null, css)
    ground.innerHTML = forest.groundSvg(c)
    if (animate) { css.push(forest.groundKF(`${kp}g${walkId}`)); ground.style.animation = `${kp}g${walkId} ${DUR}ms linear forwards` } else ground.style.animation = ''
    kfEl.textContent = css.join('\n')
    world.replaceChildren(fw)
  }

  // copy each source element's CURRENT transform/opacity onto the matching target as a still inline value
  function freezeInto(src, dst) {
    const cs = src.map(e => { const s = win.getComputedStyle(e); return [s.transform, s.opacity] })
    dst.forEach((e, i) => {
      e.style.animation = 'none'; e.style.transition = 'none'
      if (cs[i][0]) e.style.transform = cs[i][0]
      if (cs[i][1] !== '') e.style.opacity = cs[i][1]
    })
  }
  const liveDivs = () => [cam, ...cam.querySelectorAll('div')]
  const clearClasses = () => { cam.className = 'fs-cam'; light.className = 'fs-light' }

  // undo freezeInto on whatever a cancelled walk froze. The .creep layers keep their own transform/transition
  // (setCreep owns those); everything else returns to its stylesheet values.
  function thaw() {
    for (const e of frozen) {
      e.style.animation = ''; e.style.opacity = ''
      if (!creeps.includes(e)) { e.style.transition = ''; e.style.transform = '' }
    }
    frozen = []
  }

  // v3 render(): the rest frame of station s (also clears anything a cancelled walk froze in place)
  function render(s) {
    thaw()
    clearClasses()
    build(s, false)
    for (const el of slCards) { el.classList.remove('fIn', 'fOut'); el.style.opacity = +el.dataset.st === s ? 1 : 0 }
    stage.dataset.scene = `rest:${s}`
  }

  function clearCreepT() { clearTimeout(creepT); creepT = null }

  // v3 jump(): instant rest frame, creep restarts 30 ms later
  function renderRest(s) {
    clearCreepT()
    removeClones()
    setCreep(false); render(s)
    creepT = setTimeout(() => { creepT = null; setCreep(true) }, 30)
  }

  function removeClones() { for (const c of clones) c.remove(); clones.clear() }

  // the outgoing view, frozen, on top; the target rest frame under it; the clone fades out (opacity only).
  // v3's reduced-motion advance() path, plus the freeze so a mid-walk frame holds still while it fades.
  // A retarget during a cut (spec gate 7: every frame of every crossfade must be a composite of the
  // frozen source and the destination): the superseded cut's clone is NOT removed. Its cancel freezes
  // it at its current opacity; this crossfade slips its own snapshot (the in-between rest frame)
  // BENEATH it, and every clone fades to 0 together, so the first frame equals the last old frame.
  function crossfade(to, onDone) {
    clearCreepT()
    const clone = cam.cloneNode(true)
    freezeInto(liveDivs(), [clone, ...clone.querySelectorAll('div')])
    clone.classList.add('rmx'); clone.style.transition = '' // .rmx carries the 400 ms opacity transition
    clone.setAttribute('data-forest-clone', '')
    const oldest = clones.values().next().value
    if (oldest) rig.insertBefore(clone, oldest); else rig.appendChild(clone)
    clones.add(clone)
    setCreep(false)
    for (const el of creeps) { el.style.transition = 'none'; el.style.transform = 'scale(1)' } // a fresh rest frame, not a shrinking one
    render(to)
    stage.dataset.scene = `cut:${to}`
    void clone.offsetWidth
    for (const c of clones) { c.style.transition = ''; c.style.opacity = '0' }
    const t = cutT = setTimeout(() => {
      if (cutT === t) cutT = null
      removeClones()
      stage.dataset.scene = `rest:${to}`
      setCreep(true)
      onDone()
    }, FADE_MS)
    return () => {
      clearTimeout(t); if (cutT === t) cutT = null
      // hold every in-flight clone at its current opacity (a retarget stacks under them, a jump removes them)
      for (const c of clones) { const o = win.getComputedStyle(c).opacity; c.style.transition = 'none'; if (o !== '') c.style.opacity = o }
    }
  }

  // v3 advance() minus its station bookkeeping. Returns cancel.
  function startWalk(from, to, onDone) {
    if (rmOn() || to !== (from + 1) % NS) return crossfade(to, onDone)
    clearCreepT()
    walkId++
    thaw()
    build(from, true)
    for (const el of slCards) { const s = +el.dataset.st; el.classList.remove('fIn', 'fOut'); el.style.opacity = ''; if (s === to) el.classList.add('fIn'); else if (s === from) el.classList.add('fOut'); else el.style.opacity = 0 }
    const ab = walkId % 2 ? 'A' : 'B'; cam.className = 'fs-cam bob' + ab; light.className = 'fs-light sway' + ab
    setCreep(false)
    stage.dataset.scene = `walk:${from}>${to}`
    const t = walkT = setTimeout(() => {
      if (walkT === t) walkT = null
      render(to); setCreep(true)
      onDone()
    }, DUR + 40)
    return () => {
      if (walkT !== t) return
      clearTimeout(t); walkT = null
      // hold the frame where it is (a covered cut clones it next), then drop the walk classes and keyframes
      const live = liveDivs(); freezeInto(live, live); frozen = live.filter(e => e === world || !world.contains(e)) // the world's children are rebuilt, everything else is thawed
      clearClasses(); kfEl.textContent = ''
    }
  }

  function cutTo(from, to, onDone) { return crossfade(to, onDone) }

  const anims = () => (typeof stage.getAnimations === 'function' ? stage.getAnimations({ subtree: true }) : [])
  function freeze(t) { for (const a of anims()) { a.pause(); a.currentTime = t } }
  function unfreeze() { for (const a of anims()) a.play() }

  function dispose() {
    for (const t of [walkT, cutT, creepT, idleT]) clearTimeout(t)
    walkT = cutT = creepT = idleT = null
    for (const c of clones) c.remove()
    clones.clear()
    stage.remove(); cssEl.remove(); kfEl.remove()
  }

  return { renderRest, startWalk, cutTo, freeze, unfreeze, dispose, root: stage }
}
